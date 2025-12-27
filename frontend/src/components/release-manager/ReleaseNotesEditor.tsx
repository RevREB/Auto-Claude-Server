import { FileText, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

interface ReleaseNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
}

export function ReleaseNotesEditor({
  value,
  onChange,
  onGenerate,
  isGenerating,
  disabled,
}: ReleaseNotesEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="release-notes" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Release Notes
        </Label>
        {onGenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating || disabled}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-Generate
              </>
            )}
          </Button>
        )}
      </div>
      <Textarea
        id="release-notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter release notes in markdown format..."
        className="min-h-[200px] font-mono text-sm"
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Supports markdown formatting. Release notes will be included in the GitHub release.
      </p>
    </div>
  );
}
