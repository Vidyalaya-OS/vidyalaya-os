"""Django settings for the Vidyalaya OS API.

Every value that differs between environments is read from the environment,
so the same code runs locally, in CI and in production.
"""

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me-before-deploying")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,.localhost,testserver")
# Render gives every service its public hostname; accept it without extra setup.
if env("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(env("RENDER_EXTERNAL_HOSTNAME"))
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# A public demo: fills the database with the demo data, shows the demo logins
# on the sign-in page and shows parent login codes for the demo accounts on
# screen, since no SMS or email is sent. Never turn this on for a real school.
DEMO_MODE = env_bool("DEMO_MODE", False)

# The domain schools live under: greenvalley.<PLATFORM_DOMAIN>.
PLATFORM_DOMAIN = env("PLATFORM_DOMAIN", "localhost")
# Where invite links point (the web app).
WEB_APP_URL = env("WEB_APP_URL", "http://localhost:3000")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.tenancy",
    "apps.accounts",
    "apps.academics",
    "apps.people",
    "apps.timetable",
    "apps.attendance",
    "apps.homework",
    "apps.exams",
    "apps.fees",
    "apps.quizzes",
    "apps.dashboards",
    "apps.core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.tenancy.middleware.TenantMiddleware",
]

ROOT_URLCONF = "config.urls"
APPEND_SLASH = False

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# PostgreSQL is required: school separation relies on its row-level security.
# The app must connect as a role that is NOT a superuser and does NOT have
# BYPASSRLS, otherwise the database policies are silently skipped.
# Hosts such as Render give one DATABASE_URL instead of the POSTGRES_* values.
_db_url = urlparse(env("DATABASE_URL", ""))
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _db_url.path.lstrip("/") or env("POSTGRES_DB", "sms"),
        "USER": unquote(_db_url.username or "") or env("POSTGRES_USER", "sms_app"),
        "PASSWORD": unquote(_db_url.password or "") or env("POSTGRES_PASSWORD", "sms_app"),
        "HOST": _db_url.hostname or env("POSTGRES_HOST", "localhost"),
        "PORT": str(_db_url.port or "") or env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": int(env("POSTGRES_CONN_MAX_AGE", "0")),
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.EmailOrPhoneBackend"]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
TIME_ZONE = env("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage" if not DEBUG
                    else "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_RATES": {
        "login": env("LOGIN_THROTTLE_RATE", "10/min"),
        "invite": env("INVITE_THROTTLE_RATE", "10/min"),
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    "EXCEPTION_HANDLER": "apps.tenancy.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": SECRET_KEY,
}

# Demo data (apps/core/demo.py). The data itself lives in DEMO_DATA_FILE.
# DEMO_AUTOLOAD fills an empty database with it on `migrate`; the sign-in page
# offers the demo logins only when DEMO_LOGINS_VISIBLE is on. DEMO_MODE turns
# both on.
DEMO_DATA_FILE = Path(env("DEMO_DATA_FILE", BASE_DIR / "config" / "demo_data.json"))
DEMO_AUTOLOAD = env_bool("DEMO_AUTOLOAD", DEMO_MODE)
DEMO_LOGINS_VISIBLE = env_bool("DEMO_LOGINS_VISIBLE", DEMO_MODE)

# Choices offered in the web app's forms (apps/core/catalog.py). Leave empty
# to use the built-in lists, or give comma-separated values.
SCHOOL_BOARDS = env_list("SCHOOL_BOARDS")
SCHOOL_TIMEZONES = env_list("SCHOOL_TIMEZONES")

# Invite links stay valid for this many days.
INVITE_VALID_DAYS = int(env("INVITE_VALID_DAYS", "7"))
# "Forgot password" links stay valid for this many minutes.
PASSWORD_RESET_VALID_MINUTES = int(env("PASSWORD_RESET_VALID_MINUTES", "60"))

# The product name used in emails and given to the web app (GET /api/config).
APP_NAME = env("APP_NAME", "Vidyalaya OS")

# Email. Development prints messages to the console. For real delivery set
# BREVO_API_KEY (sends over HTTPS, which works on hosts that block SMTP, such as
# Render's free plan), or EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# with the EMAIL_HOST_* values below.
BREVO_API_KEY = env("BREVO_API_KEY", "")
EMAIL_BACKEND = env("EMAIL_BACKEND", "apps.accounts.email.BrevoBackend" if BREVO_API_KEY
                    else "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Vidyalaya OS <no-reply@localhost>")
EMAIL_HOST = env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = 20

# Online fee payments by parents. Each gateway is on once its keys are set.
# Razorpay test keys (rzp_test_...) and JUSPAY_ENV=sandbox take no real money.
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = env("RAZORPAY_WEBHOOK_SECRET", "")
JUSPAY_ENV = env("JUSPAY_ENV", "sandbox")
JUSPAY_MERCHANT_ID = env("JUSPAY_MERCHANT_ID", "")
JUSPAY_API_KEY = env("JUSPAY_API_KEY", "")
JUSPAY_PAYMENT_PAGE_CLIENT_ID = env("JUSPAY_PAYMENT_PAGE_CLIENT_ID", "") or JUSPAY_MERCHANT_ID
JUSPAY_WEBHOOK_USERNAME = env("JUSPAY_WEBHOOK_USERNAME", "")
JUSPAY_WEBHOOK_PASSWORD = env("JUSPAY_WEBHOOK_PASSWORD", "")
# A built-in pretend gateway with "Pay" and "Fail" buttons, for trying the
# flow with no gateway account. It records real receipts, so it is only ever
# on in development.
PAYMENT_SIMULATOR = DEBUG and env_bool("PAYMENT_SIMULATOR", True)
# The API's public address, for gateway callbacks. Found from the request when empty.
PUBLIC_API_URL = env("PUBLIC_API_URL", env("RENDER_EXTERNAL_URL", "")).rstrip("/")
# Where a finished payment may send the parent back to: the web app and the mobile app.
PAYMENT_RETURN_URLS = env_list("PAYMENT_RETURN_URLS", f"{WEB_APP_URL},vidyalaya://,exp://")
PAYMENT_TIMEOUT = 20

# Origins allowed to call the API from a browser (the web app).
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
CORS_ALLOW_HEADERS = ("accept", "authorization", "content-type", "x-school")
