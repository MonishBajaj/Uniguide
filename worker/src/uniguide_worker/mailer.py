"""Outbound email through Resend. Without RESEND_API_KEY it records messages instead (dry run), or, for local
development, delivers them to the Supabase stack's Mailpit when MAILPIT_URL is set (http://127.0.0.1:54324)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import httpx


@dataclass
class Message:
    to: str
    subject: str
    text: str


@dataclass
class Mailer:
    api_key: str | None = None
    sender: str = "Uniguide <noreply@example.com>"
    client: httpx.Client | None = None
    sent: list[Message] = field(default_factory=list)
    mailpit_url: str | None = None

    @classmethod
    def from_env(cls) -> Mailer:
        return cls(
            os.environ.get("RESEND_API_KEY") or None,
            os.environ.get("EMAIL_FROM") or cls.sender,
            mailpit_url=os.environ.get("MAILPIT_URL") or None,
        )

    @property
    def dry_run(self) -> bool:
        return self.api_key is None and self.mailpit_url is None

    def send(self, message: Message) -> bool:
        self.sent.append(message)
        if self.dry_run:
            return True
        client = self.client or httpx.Client(timeout=20.0)
        if self.api_key is None and self.mailpit_url:
            # Local only: Mailpit's send API. Resend always wins when a key is set.
            name, _, address = self.sender.rpartition(" <")
            response = client.post(
                f"{self.mailpit_url.rstrip('/')}/api/v1/send",
                json={
                    "From": {"Email": address.rstrip(">") or self.sender, "Name": name},
                    "To": [{"Email": message.to}],
                    "Subject": message.subject,
                    "Text": message.text,
                },
            )
            return response.status_code < 300
        response = client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"from": self.sender, "to": message.to, "subject": message.subject, "text": message.text},
        )
        return response.status_code < 300
