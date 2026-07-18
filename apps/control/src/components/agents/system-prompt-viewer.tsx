import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function SystemPromptViewer({ onOpenChange, open, prompt, specializationName }: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  prompt: string;
  specializationName: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setCopied(false); }}>
      <SheetContent side="right" className="w-[min(92vw,38rem)] sm:max-w-[38rem]">
        <SheetHeader className="border-b px-6 py-5 pr-14">
          <SheetTitle className="font-serif text-xl">{specializationName} system instructions</SheetTitle>
          <SheetDescription>This prompt is managed by the selected specialization and cannot be edited for this Instance.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/35 p-4 font-mono text-xs leading-6 text-foreground">{prompt}</pre>
        </div>
        <SheetFooter className="flex-row justify-between border-t px-6 py-4">
          <SheetClose asChild><Button variant="outline">Close</Button></SheetClose>
          <Button type="button" variant="secondary" onClick={() => void copyPrompt()}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy prompt"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
