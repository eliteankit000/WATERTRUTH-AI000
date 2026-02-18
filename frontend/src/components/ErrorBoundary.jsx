import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
    
    // Log to analytics service in production
    if (process.env.NODE_ENV === 'production') {
      // analytics.logError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-muted-foreground">
              We're sorry for the inconvenience. The app encountered an unexpected error.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium"
            >
              Return to Home
            </button>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-left text-xs">
                <summary className="cursor-pointer font-mono">Error Details</summary>
                <pre className="mt-2 p-4 bg-muted rounded overflow-auto">
                  {this.state.error && this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;