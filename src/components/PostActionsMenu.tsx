import { MoreHorizontal, SkipForward, FileEdit, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PostActionsMenuProps {
  onSkipPost: () => void;
  onEditNotes: () => void;
  onRequestNewDate: () => void;
}

export function PostActionsMenu({ onSkipPost, onEditNotes, onRequestNewDate }: PostActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSkipPost}>
          <SkipForward className="mr-2 h-4 w-4" />
          Skip Post
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEditNotes}>
          <FileEdit className="mr-2 h-4 w-4" />
          Edit Notes
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRequestNewDate}>
          <CalendarClock className="mr-2 h-4 w-4" />
          Request New Date
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
