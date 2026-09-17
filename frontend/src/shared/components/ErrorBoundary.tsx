import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RecoveryPage } from './recovery/RecoveryPage';

type Props = Readonly<{
  children: ReactNode;
}>;

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) {
      return <RecoveryPage message={this.state.error.message} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
