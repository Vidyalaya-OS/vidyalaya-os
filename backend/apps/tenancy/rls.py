"""PostgreSQL row-level security for school-owned tables.

Every concrete subclass of TenantModel gets a policy that only shows rows
whose school_id matches app.current_school on the connection. FORCE makes the
policy apply to the table owner too, so the app role cannot skip it.

This runs after every migrate (see apps.py), so new tables added by later
features are covered automatically. A test checks every tenant table.
"""

from django.apps import apps
from django.db import connection

FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION app_school_visible(sid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
        OR sid = NULLIF(current_setting('app.current_school', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user', true), '')::uuid
$$;
"""

POLICY_NAME = "school_isolation"


def tenant_models():
    from .models import TenantModel

    return [
        model
        for model in apps.get_models()
        if issubclass(model, TenantModel) and not model._meta.proxy and model._meta.managed
    ]


def policy_sql(table):
    q = connection.ops.quote_name(table)
    return f"""
        ALTER TABLE {q} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {q} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS {POLICY_NAME} ON {q};
        CREATE POLICY {POLICY_NAME} ON {q}
            USING (app_school_visible(school_id))
            WITH CHECK (app_school_visible(school_id));
    """


# Extra policies some tables need, on top of school isolation. Policies are
# permissive, so each one widens what is visible.
EXTRA_POLICIES = {
    # A logged-in user can list their own memberships in every school, which
    # the login screen needs to offer a school picker.
    "school_memberships": [
        ("membership_self", "FOR SELECT USING (user_id = app_current_user())"),
    ],
}


def apply_rls(using="default", **kwargs):
    if connection.vendor != "postgresql":
        return
    tables = connection.introspection.table_names()
    with connection.cursor() as cursor:
        cursor.execute(FUNCTION_SQL)
        for model in tenant_models():
            table = model._meta.db_table
            if table not in tables:
                continue
            cursor.execute(policy_sql(table))
            for name, body in EXTRA_POLICIES.get(table, []):
                q = connection.ops.quote_name(table)
                cursor.execute(f"DROP POLICY IF EXISTS {name} ON {q}; CREATE POLICY {name} ON {q} {body};")
        if "audit_logs" in tables:
            # Append-only: anyone may insert, reads are school-scoped, and
            # there is no UPDATE or DELETE policy, so those are refused.
            cursor.execute(
                """
                ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
                ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS audit_insert ON audit_logs;
                DROP POLICY IF EXISTS audit_read ON audit_logs;
                CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);
                CREATE POLICY audit_read ON audit_logs FOR SELECT USING (app_school_visible(school_id));
                """
            )
