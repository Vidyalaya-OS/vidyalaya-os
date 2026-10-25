"""Every person has their own login, lands on their own screens, and can get
back in without anyone else knowing their password."""

import re
from io import StringIO

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command

from apps.accounts import services
from apps.accounts.models import Role, User
from apps.tenancy.context import school_context

from .helpers import PASSWORD, ApiTestCase, World, make_user


def link(pattern, message):
    return re.search(pattern + r"(\S+)", message.body).group(1)


class HomeTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.b = World("beta")
        cls.owner = make_user("Owner", "owner@platform.test", is_platform_owner=True)

    def setUp(self):
        cache.clear()  # login throttle

    def login(self, email):
        response = self.client.post("/api/auth/login", {"identifier": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["home"]

    def test_each_role_lands_on_its_own_portal(self):
        self.assertEqual(self.login("owner@platform.test"), {"kind": "platform", "school": None, "role": None})
        for email, role in (("admin@alpha.test", "admin"), ("teacher@alpha.test", "teacher"),
                            ("student@alpha.test", "student"), ("parent@alpha.test", "parent")):
            self.assertEqual(self.login(email), {"kind": "school", "school": "alpha", "role": role}, email)

    def test_someone_in_two_schools_chooses_one(self):
        with school_context(self.b.school):
            services.grant_role(self.a.teacher_user, Role.TEACHER)
        self.assertEqual(self.login("teacher@alpha.test")["kind"], "choose_school")

    def test_owner_who_is_also_in_a_school_chooses(self):
        with school_context(self.a.school):
            services.grant_role(self.owner, Role.ADMIN)
        self.assertEqual(self.login("owner@platform.test")["kind"], "choose_school")

    def test_me_has_home(self):
        response = self.client_for(self.a.parent_user).get("/api/auth/me")
        self.assertEqual(response.data["home"]["role"], "parent")


class PasswordResetTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        cache.clear()

    def request_reset(self, identifier):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post("/api/auth/password-reset", {"identifier": identifier})

    def test_same_answer_for_unknown_people(self):
        known = self.request_reset("teacher@alpha.test")
        unknown = self.request_reset("nobody@alpha.test")
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_reset_flow(self):
        self.request_reset("teacher@alpha.test")
        token = link("/reset-password/", mail.outbox[0])
        old_refresh = self.client.post("/api/auth/login", {"identifier": "teacher@alpha.test",
                                                           "password": PASSWORD}).data["refresh"]

        # A reset link is not an invite link.
        self.assertEqual(self.client.get(f"/api/auth/invites/{token}").status_code, 404)
        opened = self.client.get(f"/api/auth/password-reset/{token}")
        self.assertEqual(opened.data["email"], "teacher@alpha.test")

        done = self.client.post(f"/api/auth/password-reset/{token}", {"password": "New-teacher-pass-9"})
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["home"], {"kind": "school", "school": "alpha", "role": "teacher"})

        # Works once; the old password and other devices are signed out.
        again = self.client.post(f"/api/auth/password-reset/{token}", {"password": "Another-pass-99"})
        self.assertEqual(again.status_code, 404)
        self.assertEqual(self.client.post("/api/auth/refresh", {"refresh": old_refresh}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", {"identifier": "teacher@alpha.test",
                                                              "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", {"identifier": "teacher@alpha.test",
                                                              "password": "New-teacher-pass-9"}).status_code, 200)

    def test_invited_person_gets_their_invite_again(self):
        with school_context(self.a.school):
            user, _ = services.find_or_create_user("New Teacher", "new@alpha.test")
            services.grant_role(user, Role.TEACHER)
        self.request_reset("new@alpha.test")
        self.assertIn("/invite/", mail.outbox[0].body)

    def test_switched_off_login_gets_nothing(self):
        User.objects.filter(pk=self.a.teacher_user.pk).update(status=User.Status.DISABLED)
        self.request_reset("teacher@alpha.test")
        self.assertEqual(len(mail.outbox), 0)


class LoginLinkTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def test_admin_sends_a_login_link(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client_for(self.a.admin, self.a.school).post(
                f"/api/students/{self.a.student.pk}/send-login-link/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["sent"], "reset")
        self.assertIn("/reset-password/", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to, ["student@alpha.test"])

    def test_teacher_cannot(self):
        response = self.client_for(self.a.teacher_user, self.a.school).post(
            f"/api/students/{self.a.student.pk}/send-login-link/")
        self.assertEqual(response.status_code, 403)


class OwnerManagesAdminsTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.owner = make_user("Owner", "owner@platform.test", is_platform_owner=True)

    def url(self, rest=""):
        return f"/api/platform/schools/{self.a.school.pk}/admins/{rest}"

    def test_add_list_and_remove(self):
        client = self.client_for(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            added = client.post(self.url(), {"name": "Second Admin", "email": "second@alpha.test"})
        self.assertEqual(added.status_code, 201, added.data)
        self.assertIn("/invite/", mail.outbox[0].body)
        emails = {row["email"] for row in client.get(self.url()).data}
        self.assertEqual(emails, {"admin@alpha.test", "second@alpha.test"})

        self.assertEqual(client.delete(self.url(f"{added.data['id']}/")).status_code, 204)
        self.assertEqual({row["email"] for row in client.get(self.url()).data}, {"admin@alpha.test"})
        # The last admin stays.
        self.assertEqual(client.delete(self.url(f"{self.a.admin.pk}/")).status_code, 400)

    def test_owner_sends_admin_a_reset_link(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client_for(self.owner).post(self.url(f"{self.a.admin.pk}/send-login-link/"))
        self.assertEqual(response.data["sent"], "reset")
        self.assertIn("/reset-password/", mail.outbox[0].body)

    def test_school_admin_cannot_use_platform_routes(self):
        response = self.client_for(self.a.admin).get(self.url())
        self.assertEqual(response.status_code, 403)


class CreatePlatformOwnerTests(ApiTestCase):
    def setUp(self):
        cache.clear()

    def test_command_creates_owner_with_one_time_link(self):
        out = StringIO()
        with self.captureOnCommitCallbacks(execute=True):
            call_command("create_platform_owner", email="boss@platform.test", name="Boss", stdout=out)
        owner = User.objects.get(email="boss@platform.test")
        self.assertTrue(owner.is_platform_owner)
        self.assertFalse(owner.has_usable_password())
        token = re.search(r"/invite/(\S+)", out.getvalue()).group(1)
        self.assertIn(token, mail.outbox[0].body)

        accepted = self.client.post(f"/api/auth/invites/{token}", {"password": "Owner-pass-2026"})
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["home"]["kind"], "platform")

        # Run again: the owner already has a password, so a reset link is printed.
        out = StringIO()
        call_command("create_platform_owner", email="boss@platform.test", name="Boss", stdout=out)
        self.assertIn("/reset-password/", out.getvalue())
        self.assertEqual(User.objects.filter(email="boss@platform.test").count(), 1)

    def test_if_missing_runs_once(self):
        with self.captureOnCommitCallbacks(execute=True):
            call_command("create_platform_owner", "--if-missing", email="boss@platform.test", name="Boss",
                         stdout=StringIO())
            out = StringIO()
            call_command("create_platform_owner", "--if-missing", email="boss@platform.test", name="Boss",
                         stdout=out)
        self.assertIn("already exists", out.getvalue())
        self.assertEqual(len(mail.outbox), 1)
