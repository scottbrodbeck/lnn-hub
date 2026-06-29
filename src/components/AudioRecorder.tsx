import { Mic, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AudioRecorderProps {
  onTranscriptChange: (transcript: string) => void;
  value: string;
}

export const AudioRecorder = ({ onTranscriptChange, value }: AudioRecorderProps) => {
  const { isRecording, transcript, error, startRecording, stopRecording, resetRecording } = useAudioRecorder();

  useEffect(() => {
    if (transcript) {
      onTranscriptChange(transcript);
    }
  }, [transcript, onTranscriptChange]);

  // Reset internal recording state when parent value is cleared (moving to next question)
  useEffect(() => {
    if (value === '' && transcript !== '') {
      resetRecording();
    }
  }, [value, transcript, resetRecording]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTranscriptChange(e.target.value);
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {!isRecording ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={startRecording}
            title="Start recording"
          >
            <Mic className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={stopRecording}
              className="animate-pulse"
              title="Stop recording"
            >
              <Square className="h-4 w-4" />
            </Button>
            <div className="flex items-center text-sm text-muted-foreground">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>
              Recording...
            </div>
          </>
        )}
        
        {(transcript || value) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={resetRecording}
            title="Clear and re-record"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Textarea
        value={value}
        onChange={handleTextChange}
        placeholder="Type your answer or use the microphone button above to record"
        className="min-h-[100px]"
      />
    </div>
  );
};
