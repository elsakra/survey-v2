import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";

const topics = [
  {
    title: "Create and test a campaign",
    body:
      "Draft a study with pillars and instructions, run a browser test call from the campaign test page, then add contacts when you are ready.",
  },
  {
    title: "Launch and monitor",
    body:
      "From the campaign review screen, launch when status is ready. Use pause or resume to control the queue. Clone a campaign to iterate without touching the original.",
  },
  {
    title: "Contacts and retries",
    body:
      "Upload or add contacts per campaign. Outbound calls respect your calling hours and retry policy; check Activity for recent attempts per contact.",
  },
  {
    title: "Transcripts and recordings",
    body:
      "Open a campaign after calls complete to read transcripts and review outcomes stored from Vapi webhooks.",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Help"
        description="Quick orientation for running voice interview campaigns in Voicewell."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {topics.map((t) => (
          <Card key={t.title}>
            <CardBody className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{t.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">More</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            For product questions or bugs, contact your workspace administrator or the team that manages this
            deployment.
          </p>
          <Link href="/dashboard" className="inline-block text-sm font-medium text-[var(--color-label)] hover:underline">
            Back to campaigns
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
