import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SkipPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentName: string;
  dueDate: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function SkipPostDialog({
  open,
  onOpenChange,
  assignmentName,
  dueDate,
  onConfirm,
  isLoading,
}: SkipPostDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Skip this post?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to skip <strong>{assignmentName}</strong> due on{" "}
            <strong>{dueDate}</strong>? This post will appear in your Submitted panel
            with a "Skipped" status.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "Skipping..." : "Skip Post"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
