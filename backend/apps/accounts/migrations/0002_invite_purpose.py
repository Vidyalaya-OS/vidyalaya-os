from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="invite",
            name="purpose",
            field=models.CharField(choices=[("invite", "Invite"), ("reset", "Password reset")], default="invite",
                                   max_length=10),
        ),
    ]
