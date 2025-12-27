import { useEffect, useState } from 'react';
import { Tag, Plus, RefreshCw, Loader2, AlertCircle, CheckCircle2, Rocket } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useProjectStore } from '../stores/project-store';
import { useTaskStore } from '../stores/task-store';
import { releaseApi, type Release, type VersionInfo } from '../lib/api';
import { CurrentVersionCard } from './release-manager/CurrentVersionCard';
import { ReleaseCandidateCard } from './release-manager/ReleaseCandidateCard';
import { ReleaseNotesEditor } from './release-manager/ReleaseNotesEditor';

export function ReleaseManager() {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const tasks = useTaskStore((state) => state.tasks);

  // State
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('0.0.0');
  const [versionInfo, setVersionInfo] = useState<Partial<VersionInfo> | null>(null);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  // New release dialog
  const [showNewReleaseDialog, setShowNewReleaseDialog] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isCreatingRelease, setIsCreatingRelease] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);

  // Promote dialog
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [releaseToPromote, setReleaseToPromote] = useState<Release | null>(null);
  const [isPromoting, setIsPromoting] = useState(false);

  // Results
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load releases and version info
  useEffect(() => {
    if (selectedProjectId) {
      loadReleases();
      loadVersionInfo();
    }
  }, [selectedProjectId]);

  const loadReleases = async () => {
    if (!selectedProjectId) return;
    setIsLoadingReleases(true);
    setError(null);

    try {
      const result = await releaseApi.list(selectedProjectId);
      if (result.success) {
        setReleases(result.releases);
      } else {
        setError(result.error || 'Failed to load releases');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases');
    } finally {
      setIsLoadingReleases(false);
    }
  };

  const loadVersionInfo = async () => {
    if (!selectedProjectId) return;
    setIsLoadingVersion(true);

    try {
      // Get current version
      const currentResult = await releaseApi.currentVersion(selectedProjectId);
      if (currentResult.success && currentResult.version) {
        setCurrentVersion(currentResult.version);
      }

      // Get next version calculation
      const doneTasks = tasks.filter((t) => t.status === 'done').map((t) => t.id);
      const nextResult = await releaseApi.nextVersion(selectedProjectId, doneTasks);
      if (nextResult.success) {
        setVersionInfo(nextResult);
        // Pre-fill new version
        if (nextResult.next) {
          setNewVersion(nextResult.next);
        }
        // Pre-select done tasks
        setSelectedTaskIds(doneTasks);
      }
    } catch (err) {
      console.error('Failed to load version info:', err);
    } finally {
      setIsLoadingVersion(false);
    }
  };

  const handleOpenNewRelease = () => {
    // Refresh version info before opening
    loadVersionInfo();
    setShowNewReleaseDialog(true);
  };

  const handleGenerateNotes = async () => {
    if (!selectedProjectId || !newVersion) return;
    setIsGeneratingNotes(true);

    try {
      const result = await releaseApi.generateChangelog(selectedProjectId, newVersion, selectedTaskIds);
      if (result.success && result.changelog) {
        setReleaseNotes(result.changelog);
      }
    } catch (err) {
      console.error('Failed to generate notes:', err);
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleCreateRelease = async () => {
    if (!selectedProjectId || !newVersion) return;
    setIsCreatingRelease(true);
    setError(null);

    try {
      const result = await releaseApi.create(selectedProjectId, newVersion, {
        releaseNotes,
        taskIds: selectedTaskIds,
      });

      if (result.success) {
        setSuccessMessage(`Release v${newVersion} created successfully`);
        setShowNewReleaseDialog(false);
        setNewVersion('');
        setReleaseNotes('');
        loadReleases();
        loadVersionInfo();
      } else {
        setError(result.error || 'Failed to create release');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create release');
    } finally {
      setIsCreatingRelease(false);
    }
  };

  const handlePromoteClick = (release: Release) => {
    setReleaseToPromote(release);
    setShowPromoteDialog(true);
  };

  const handleConfirmPromote = async () => {
    if (!selectedProjectId || !releaseToPromote) return;
    setIsPromoting(true);
    setError(null);

    try {
      const result = await releaseApi.promote(selectedProjectId, releaseToPromote.version);

      if (result.success) {
        setSuccessMessage(`v${releaseToPromote.version} promoted to main${result.tag ? ` and tagged ${result.tag}` : ''}`);
        setShowPromoteDialog(false);
        setReleaseToPromote(null);
        loadReleases();
      } else {
        setError(result.error || 'Failed to promote release');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote release');
    } finally {
      setIsPromoting(false);
    }
  };

  const handleAbandon = async (release: Release) => {
    if (!selectedProjectId) return;
    setError(null);

    try {
      const result = await releaseApi.abandon(selectedProjectId, release.version);

      if (result.success) {
        setSuccessMessage(`Release v${release.version} abandoned`);
        loadReleases();
      } else {
        setError(result.error || 'Failed to abandon release');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abandon release');
    }
  };

  const handleRefresh = () => {
    loadReleases();
    loadVersionInfo();
  };

  const handleDismissMessage = () => {
    setError(null);
    setSuccessMessage(null);
  };

  // Group releases by status
  const candidateReleases = releases.filter((r) => r.status === 'candidate');
  const promotedReleases = releases.filter((r) => r.status === 'promoted');

  if (!selectedProjectId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to manage releases</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            Release Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and promote releases from the dev branch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoadingReleases}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingReleases ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenNewRelease}>
            <Plus className="h-4 w-4 mr-2" />
            New Release
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Success/Error Messages */}
          {successMessage && (
            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{successMessage}</span>
                <Button variant="ghost" size="sm" onClick={handleDismissMessage}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="ghost" size="sm" onClick={handleDismissMessage}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Version Status Card */}
          <CurrentVersionCard
            currentVersion={currentVersion}
            nextVersion={versionInfo?.next}
            bumpType={versionInfo?.bumpType}
            breakingChanges={versionInfo?.breakingChanges}
            features={versionInfo?.features}
            fixes={versionInfo?.fixes}
            isLoading={isLoadingVersion}
          />

          {/* Release Candidates */}
          {candidateReleases.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Tag className="h-5 w-5 text-amber-500" />
                Release Candidates ({candidateReleases.length})
              </h2>
              <div className="grid gap-4">
                {candidateReleases.map((release) => (
                  <ReleaseCandidateCard
                    key={release.version}
                    version={release.version}
                    branch={release.branch}
                    status={release.status}
                    tag={release.tag}
                    releaseNotes={release.releaseNotes}
                    commitDate={release.commit?.date}
                    commitMessage={release.commit?.message}
                    onPromote={() => handlePromoteClick(release)}
                    onAbandon={() => handleAbandon(release)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Promoted Releases */}
          {promotedReleases.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Released ({promotedReleases.length})
              </h2>
              <div className="grid gap-4">
                {promotedReleases.slice(0, 5).map((release) => (
                  <ReleaseCandidateCard
                    key={release.version}
                    version={release.version}
                    branch={release.branch}
                    status={release.status}
                    tag={release.tag}
                    releaseNotes={release.releaseNotes}
                    commitDate={release.commit?.date}
                    commitMessage={release.commit?.message}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {releases.length === 0 && !isLoadingReleases && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Tag className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">
                  No releases found.
                  <br />
                  Create a release candidate to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* New Release Dialog */}
      <Dialog open={showNewReleaseDialog} onOpenChange={setShowNewReleaseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Release Candidate
            </DialogTitle>
            <DialogDescription>
              Create a new release branch from dev for testing and QA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder="1.2.0"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {versionInfo?.bumpType && (
                  <>Suggested: {versionInfo.next} ({versionInfo.bumpType} bump)</>
                )}
              </p>
            </div>

            <ReleaseNotesEditor
              value={releaseNotes}
              onChange={setReleaseNotes}
              onGenerate={handleGenerateNotes}
              isGenerating={isGeneratingNotes}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewReleaseDialog(false)} disabled={isCreatingRelease}>
              Cancel
            </Button>
            <Button onClick={handleCreateRelease} disabled={!newVersion || isCreatingRelease}>
              {isCreatingRelease ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Tag className="h-4 w-4 mr-2" />
                  Create Release
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote Confirmation Dialog */}
      <Dialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Promote to Main
            </DialogTitle>
            <DialogDescription>
              This will merge the release branch into main and create a version tag.
            </DialogDescription>
          </DialogHeader>

          {releaseToPromote && (
            <div className="py-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="font-mono text-lg font-bold text-center">
                  v{releaseToPromote.version}
                </p>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  {releaseToPromote.branch}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                This action will:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
                <li>Merge release/{releaseToPromote.version} into main</li>
                <li>Create tag v{releaseToPromote.version}</li>
                <li>Back-merge changes to dev</li>
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPromoteDialog(false)} disabled={isPromoting}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPromote} disabled={isPromoting}>
              {isPromoting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Promoting...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Promote
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
