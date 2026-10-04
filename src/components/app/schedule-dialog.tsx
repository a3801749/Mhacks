"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BlockForm } from "./block-form"

export interface ScheduleDraft {
  date: string
  startMin?: number
  endMin?: number
}

export function ScheduleDialog({ draft, onClose }: { draft: ScheduleDraft | null; onClose: () => void }) {
  return <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">Add to calendar</DialogTitle>
        <DialogDescription>Focus time, with or without an assignment, or a personal event.</DialogDescription>
      </DialogHeader>
      {draft && <BlockForm key={`${draft.date}-${draft.startMin}-${draft.endMin}`} draft={draft} onDone={onClose} />}
    </DialogContent>
  </Dialog>
}
