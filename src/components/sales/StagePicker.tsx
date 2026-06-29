import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmStages } from '@/hooks/useCrmPipeline';

interface Props {
  pipelineId?: string;
  value?: string;
  onChange: (stageId: string) => void;
  disabled?: boolean;
}

export function StagePicker({ pipelineId, value, onChange, disabled }: Props) {
  const { data: stages = [] } = useCrmStages(pipelineId);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || !pipelineId}>
      <SelectTrigger>
        <SelectValue placeholder="Select stage" />
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
