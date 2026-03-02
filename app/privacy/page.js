export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px", lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p><strong>Publisher:</strong> Tony Day</p>
      <p><strong>Contact:</strong> ltonyday71@gmail.com</p>
      <p><strong>Jurisdiction:</strong> USA</p>

      <h2>Overview</h2>
      <p>
        This app connects to Adobe Lightroom to access photo metadata and image renditions so that photos can be
        displayed on a track map. We do not sell personal data.
      </p>

      <h2>Data We Collect</h2>
      <ul>
        <li>Adobe OAuth tokens (stored server-side and encrypted).</li>
        <li>Photo metadata such as asset ID, capture time, and alt text.</li>
      </ul>

      <h2>Data We Do Not Store</h2>
      <ul>
        <li>We do not store image files or image binaries.</li>
        <li>We do not store your Adobe password.</li>
      </ul>

      <h2>How We Use Data</h2>
      <ul>
        <li>To sync Lightroom photo metadata into the app.</li>
        <li>To stream image renditions directly from Lightroom to the viewer.</li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Photo metadata is retained until you disconnect or request removal. Tokens are stored only as long as needed
        to access Lightroom on your behalf.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        Adobe Lightroom is used for authentication and photo access. Its privacy policy also applies.
      </p>

      <h2>Your Choices</h2>
      <ul>
        <li>You can revoke access at any time from your Adobe account or by contacting us.</li>
        <li>You can request deletion of stored metadata by contacting us.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. The “Last updated” date will be revised accordingly.
      </p>

      <p><strong>Last updated:</strong> March 2, 2026</p>
    </main>
  );
}
