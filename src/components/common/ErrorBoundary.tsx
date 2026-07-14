import { Component, type ReactNode, type ErrorInfo } from 'react';
import * as Sentry from '@sentry/react';
import { I18nContext } from '@/lib/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  static contextType = I18nContext;
  declare context: React.ContextType<typeof I18nContext>;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    if (typeof Sentry.captureException === 'function') {
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    }
  }

  render() {
    if (this.state.hasError) {
      const t = this.context?.t ?? ((key: string) => key);
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-lg font-semibold">{t('somethingWentWrong')}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {this.state.error?.message || t('unexpectedError')}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {t('tryAgain')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
