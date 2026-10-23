import re

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts import services
from apps.accounts.models import Invite, OneTimeCode, Role, User
from apps.people.models import Guardian
from apps.tenancy.context import school_context

from .helpers import PASSWORD, ApiTestCase, World, make_user


class LoginTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.b = World("beta")

    def setUp(self):
        cache.clear()  # login throttle

    def login(self, identifier, password=PASSWORD):
        return APIClient().post("/api/auth/login", {"identifier": identifier, "password": password})

    def test_login_with_email_lists_schools_and_roles(self):
        response = self.login("ADMIN@alpha.test ")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["memberships"],
                         [{"school": {"id": str(self.a.school.id), "name": "Alpha School", "subdomain": "alpha",
                                      "status": "active"}, "roles": ["admin"]}])

    def test_login_with_phone(self):
        make_user("Phone person", phone="+91 98765 43210")
        user = User.objects.get(phone="+919876543210")
        with school_context(self.a.school):
            services.grant_role(user, Role.PARENT)
        self.assertEqual(self.login("+91 98765 43210").status_code, 200)

    def test_wrong_password(self):
        self.assertEqual(self.login("admin@alpha.test", "nope").status_code, 401)
        self.assertEqual(self.login("nobody@alpha.test").status_code, 401)

    def test_user_without_school_cannot_log_in(self):
        make_user("Loner", "loner@test.test")
        self.assertEqual(self.login("loner@test.test").status_code, 403)

    def test_one_person_in_two_schools_with_several_roles(self):
        # Alpha's teacher is also a parent at Beta, and a parent at Alpha.
        teacher = self.a.teacher_user
        with school_context(self.b.school):
            services.grant_role(teacher, Role.PARENT)
        with school_context(self.a.school):
            services.grant_role(teacher, Role.PARENT)
        response = self.login("teacher@alpha.test")
        roles = {m["school"]["subdomain"]: sorted(m["roles"]) for m in response.data["memberships"]}
        self.assertEqual(roles, {"alpha": ["parent", "teacher"], "beta": ["parent"]})

        # /me in one school shows only that school's roles.
        access = response.data["access"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_SCHOOL="beta")
        me = client.get("/api/auth/me")
        self.assertEqual(me.data["current_school"]["roles"], ["parent"])

    def test_jwt_works_end_to_end_and_refresh_rotates(self):
        tokens = self.login("admin@alpha.test").data
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}", HTTP_X_SCHOOL="alpha")
        self.assertEqual(client.get("/api/students/").status_code, 200)
        refreshed = APIClient().post("/api/auth/refresh", {"refresh": tokens["refresh"]})
        self.assertEqual(refreshed.status_code, 200)
        # Logging out blacklists the refresh token.
        client.post("/api/auth/logout", {"refresh": refreshed.data["refresh"]})
        self.assertEqual(APIClient().post("/api/auth/refresh", {"refresh": refreshed.data["refresh"]}).status_code,
                         401)

    def test_disabled_user_cannot_log_in(self):
        User.objects.filter(pk=self.a.admin.pk).update(status=User.Status.DISABLED)
        self.assertEqual(self.login("admin@alpha.test").status_code, 401)

    def test_login_is_rate_limited(self):
        codes = [self.login("admin@alpha.test", "wrong").status_code for _ in range(12)]
        self.assertIn(429, codes)

    def test_change_password(self):
        client = self.client_for(self.a.admin)
        response = client.post("/api/auth/password", {"current_password": "bad", "new_password": "N3w-strong-pass"})
        self.assertEqual(response.status_code, 400)
        response = client.post("/api/auth/password", {"current_password": PASSWORD,
                                                      "new_password": "N3w-strong-pass"})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.login("admin@alpha.test", "N3w-strong-pass").status_code, 200)

    def test_passwords_are_hashed_with_argon2(self):
        self.assertTrue(User.objects.get(pk=self.a.admin.pk).password.startswith("argon2"))


class InviteTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def test_invite_flow(self):
        with school_context(self.a.school):
            user, _ = services.find_or_create_user("New Teacher", "new@alpha.test")
            services.grant_role(user, Role.TEACHER)
            with self.captureOnCommitCallbacks(execute=True):
                services.send_invite(user)
        self.assertEqual(len(mail.outbox), 1)
        token = re.search(r"/invite/(\S+)", mail.outbox[0].body).group(1)

        anon = APIClient()
        info = anon.get(f"/api/auth/invites/{token}")
        self.assertEqual(info.status_code, 200)
        self.assertEqual(info.data["school"], "Alpha School")
        self.assertEqual(anon.post(f"/api/auth/invites/{token}", {"password": "123"}).status_code, 400)
        accepted = anon.post(f"/api/auth/invites/{token}", {"password": "Fresh-pass-2026"})
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data["memberships"][0]["roles"], ["teacher"])
        self.assertEqual(User.objects.get(pk=user.pk).status, User.Status.ACTIVE)
        # Single use.
        self.assertEqual(anon.get(f"/api/auth/invites/{token}").status_code, 404)

    def test_only_the_hash_is_stored(self):
        with school_context(self.a.school):
            user, _ = services.find_or_create_user("Someone", "someone@alpha.test")
            services.send_invite(user)
        invite = Invite.objects.get(user=user)
        self.assertEqual(len(invite.token_hash), 64)

    def test_new_invite_closes_the_old_one(self):
        with school_context(self.a.school):
            user, _ = services.find_or_create_user("Someone", "someone@alpha.test")
            first, token1 = Invite.issue(user, self.a.school)
            _, token2 = Invite.issue(user, self.a.school)
        self.assertIsNone(Invite.find_open(token1))
        self.assertIsNotNone(Invite.find_open(token2))


class OtpTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        cache.clear()

    def test_parent_can_log_in_with_a_code(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = APIClient().post("/api/auth/otp/request", {"identifier": "parent@alpha.test"})
        self.assertEqual(response.status_code, 200)
        code = re.search(r"code is (\d{6})", mail.outbox[-1].body).group(1)
        bad = APIClient().post("/api/auth/otp/verify", {"identifier": "parent@alpha.test", "code": "000000"
                                                         if code != "000000" else "111111"})
        self.assertEqual(bad.status_code, 401)
        good = APIClient().post("/api/auth/otp/verify", {"identifier": "parent@alpha.test", "code": code})
        self.assertEqual(good.status_code, 200)
        self.assertEqual(good.data["memberships"][0]["roles"], ["parent"])

    def test_code_is_never_in_the_answer_outside_demo_mode(self):
        response = APIClient().post("/api/auth/otp/request", {"identifier": "parent@alpha.test"})
        self.assertNotIn("demo_code", response.data)

    @override_settings(DEMO_MODE=True)
    def test_demo_mode_shows_the_code_for_demo_accounts(self):
        response = APIClient().post("/api/auth/otp/request", {"identifier": "parent@alpha.test"})
        code = response.data["demo_code"]
        good = APIClient().post("/api/auth/otp/verify", {"identifier": "parent@alpha.test", "code": code})
        self.assertEqual(good.status_code, 200)

    @override_settings(DEMO_MODE=True)
    def test_demo_mode_keeps_real_addresses_codes_private(self):
        user = self.a.parent_user
        user.email = "real.parent@example.com"
        user.save(update_fields=["email"])
        response = APIClient().post("/api/auth/otp/request", {"identifier": "real.parent@example.com"})
        self.assertTrue(OneTimeCode.objects.filter(user=user).exists())
        self.assertNotIn("demo_code", response.data)

    def test_codes_are_only_for_parents(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = APIClient().post("/api/auth/otp/request", {"identifier": "teacher@alpha.test"})
        self.assertEqual(response.status_code, 200)  # same answer, nothing sent
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(OneTimeCode.objects.exists())

    def test_code_locks_after_too_many_attempts(self):
        user = self.a.parent_user
        code = OneTimeCode.issue(user)
        for _ in range(OneTimeCode.MAX_ATTEMPTS):
            OneTimeCode.verify(user, "999999" if code != "999999" else "888888")
        self.assertFalse(OneTimeCode.verify(user, code))
