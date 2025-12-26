import { useState, useEffect } from 'react';
import { Github, CheckCircle2, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { GitHubOAuthFlow } from '../project-settings/GitHubOAuthFlow';

interface GitHubStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * GitHub step component for the onboarding wizard.
 * Guides users through GitHub CLI authentication using the existing GitHubOAuthFlow.
 */
export function GitHubStep({ onNext, onBack, onSkip }: GitHubStepProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | undefined>();

  // Check existing GitHub auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await window.api.checkGitHubAuth();
        if (result.success && result.data?.authenticated) {
          setIsAuthenticated(true);
          setUsername(result.data.username);
        }
      } catch (err) {
        console.error('Failed to check GitHub auth:', err);
      }
    };
    checkAuth();
  }, []);

  const handleAuthSuccess = (token: string, authUsername?: string) => {
    setIsAuthenticated(true);
    setUsername(authUsername);
  };

  const handleContinue = () => {
    onNext();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Github className="h-7 w-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Connect to GitHub
          </h1>
          <p className="mt-2 text-muted-foreground">
            Authenticate with GitHub to enable repository features
          </p>
        </div>

        {/* Already authenticated state */}
        {isAuthenticated ? (
          <div className="space-y-6">
            <Card className="border border-success/30 bg-success/10">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-success">
                      GitHub Connected
                    </h3>
                    <p className="text-sm text-success/80 mt-1">
                      {username ? `Authenticated as ${username}` : 'Your GitHub account is connected'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-info/30 bg-info/10">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      You can now clone repositories, create branches, and push code directly from Auto Claude.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info card */}
            <Card className="border border-info/30 bg-info/10">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      GitHub authentication enables repository cloning, branch management, and code pushing.
                      This uses the GitHub CLI (gh) for secure authentication.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GitHub OAuth Flow */}
            <GitHubOAuthFlow
              onSuccess={handleAuthSuccess}
              onCancel={onSkip}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            Back
          </Button>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!isAuthenticated}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
