import { ShieldAlert } from "lucide-react";
import { Card, EmptyState, LinkButton } from "@/components/ui";

export const metadata = { title: "No access · Care Booking" };

export default function NoAccessPage() {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={<ShieldAlert size={22} />}
        title="You don't have access to this page"
        text="Ask the Director if you need this permission."
        action={<LinkButton href="/dashboard" variant="secondary">Back to dashboard</LinkButton>}
      />
    </Card>
  );
}
