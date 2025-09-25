import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © 2025 Gala 8Ball. All rights reserved.
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-2 text-sm md:flex-row md:gap-6">
            <Link 
              href="/docs/api" 
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-api-docs"
            >
              API Docs
            </Link>
            <Link 
              href="/terms" 
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-terms"
            >
              Terms & Conditions
            </Link>
            <Link 
              href="/privacy" 
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-privacy"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}