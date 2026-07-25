"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerDeployment } from "@/actions/system";

export function DeployButton({ configured }: { configured: boolean }) {
  const [isPending, startTransition] = useTransition();

  function deploy() {
    startTransition(async () => {
      const res = await triggerDeployment();
      if (res.success) toast.success(res.message ?? "Tetiklendi.");
      else toast.error(res.error);
    });
  }

  return (
    <Button onClick={deploy} disabled={isPending || !configured} className="bg-[#5267ff] hover:bg-[#4254e1]">
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
      Deployment Tetikle
    </Button>
  );
}
