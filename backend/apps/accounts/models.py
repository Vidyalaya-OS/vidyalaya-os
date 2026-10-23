import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.tenancy.models import School, TenantModel


def normalize_email(email):
    email = (email or "").strip().lower()
    return email or None


def normalize_phone(phone):
    phone = "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+")
    return phone or None


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email=None, password=None, **extra):
        email = normalize_email(email)
        extra["phone"] = normalize_phone(extra.get("phone"))
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_platform_owner", True)
        extra.setdefault("status", User.Status.ACTIVE)
        return self.create_user(email, password, **extra)

    def find_by_identifier(self, identifier):
        """Look a user up by email or phone, whichever the identifier is."""
        identifier = (identifier or "").strip()
        if "@" in identifier:
            return self.filter(email=normalize_email(identifier)).first()
        phone = normalize_phone(identifier)
        return self.filter(phone=phone).first() if phone else None


class User(AbstractBaseUser, PermissionsMixin):
    """One login per person, shared across every school they belong to.

    A person with neither email nor phone (often a young student) has a user
    row but cannot log in until one is added.
    """

    class Status(models.TextChoices):
        INVITED = "invited", "Invited"
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INVITED)
    is_platform_owner = models.BooleanField(
        default=False, help_text="Platform staff: onboards and manages schools."
    )
    is_staff = models.BooleanField(default=False, help_text="Can sign in to the Django admin.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.name} <{self.email or self.phone}>"

    @property
    def is_active(self):
        return self.status != self.Status.DISABLED

    def save(self, *args, **kwargs):
        self.email = normalize_email(self.email)
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)


class Role(models.TextChoices):
    ADMIN = "admin", "School admin"
    TEACHER = "teacher", "Teacher"
    STUDENT = "student", "Student"
    PARENT = "parent", "Parent"


class SchoolMembership(TenantModel):
    """A user's role in one school. A user may hold several roles."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=Role.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "school_memberships"
        constraints = [
            models.UniqueConstraint(fields=["school", "user", "role"], name="unique_membership_role")
        ]

    def __str__(self):
        return f"{self.user} - {self.role}"


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Invite(models.Model):
    """A one-time link that lets an invited user set their password.

    Not school-scoped (the person opening the link is not logged in yet);
    only a hash of the token is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="invites")
    school = models.ForeignKey(School, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invites"

    @classmethod
    def issue(cls, user, school=None):
        """Create an invite and return (invite, raw_token). Older open invites are closed."""
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        token = secrets.token_urlsafe(32)
        invite = cls.objects.create(
            user=user,
            school=school,
            token_hash=_hash(token),
            expires_at=timezone.now() + timedelta(days=settings.INVITE_VALID_DAYS),
        )
        return invite, token

    @classmethod
    def find_open(cls, token):
        return (
            cls.objects.select_related("user", "school")
            .filter(token_hash=_hash(token or ""), used_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )


class OneTimeCode(models.Model):
    """A short code sent by SMS or email, the optional parent login."""

    MAX_ATTEMPTS = 5
    VALID_MINUTES = 10

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="one_time_codes")
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "one_time_codes"

    @classmethod
    def issue(cls, user):
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        code = f"{secrets.randbelow(10**6):06d}"
        cls.objects.create(
            user=user,
            code_hash=_hash(code),
            expires_at=timezone.now() + timedelta(minutes=cls.VALID_MINUTES),
        )
        return code

    @classmethod
    def verify(cls, user, code):
        otp = (
            cls.objects.filter(user=user, used_at__isnull=True, expires_at__gt=timezone.now())
            .order_by("-created_at")
            .first()
        )
        if otp is None or otp.attempts >= cls.MAX_ATTEMPTS:
            return False
        if secrets.compare_digest(otp.code_hash, _hash(code or "")):
            otp.used_at = timezone.now()
            otp.save(update_fields=["used_at"])
            return True
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return False


class AuditLog(models.Model):
    """Who changed what. Append-only: the database refuses updates and deletes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    action = models.CharField(max_length=100)
    entity = models.CharField(max_length=100, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["school", "created_at"])]
