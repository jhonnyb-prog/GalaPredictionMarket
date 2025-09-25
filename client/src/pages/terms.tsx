export default function Terms() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        
        <div className="bg-muted/50 border rounded-lg p-6 mb-8">
          <p className="text-muted-foreground mb-4">
            <strong>Last updated:</strong> {new Date().toLocaleDateString()}
          </p>
          <p className="text-muted-foreground">
            This page is under development. Please check back soon for our complete Terms of Service.
          </p>
        </div>
        
        <div className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing and using Gala 8Ball, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
            <p className="text-muted-foreground">
              Permission is granted to temporarily download one copy of Gala 8Ball per device for personal, non-commercial transitory viewing only.
            </p>
          </section>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Disclaimer</h2>
            <p className="text-muted-foreground">
              The materials on Gala 8Ball are provided on an 'as is' basis. Gala 8Ball makes no warranties, expressed or implied.
            </p>
          </section>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Contact Information</h2>
            <p className="text-muted-foreground">
              For questions about these Terms of Service, please contact us at support@gala8ball.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}