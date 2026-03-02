const test = require("node:test");
const assert = require("node:assert/strict");
const { extractAltTextFromXmp } = require("../lib/lightroom-client");

test("extractAltTextFromXmp finds accessibility alt text", () => {
  const xmp = `
    <rdf:RDF>
      <rdf:Description>
        <Iptc4xmpCore:AltTextAccessibility>
          <rdf:Alt>
            <rdf:li xml:lang="x-default">Turn 3 inside battle</rdf:li>
          </rdf:Alt>
        </Iptc4xmpCore:AltTextAccessibility>
      </rdf:Description>
    </rdf:RDF>
  `;
  assert.equal(extractAltTextFromXmp(xmp), "Turn 3 inside battle");
});

test("extractAltTextFromXmp falls back to dc:description", () => {
  const xmp = `
    <rdf:RDF>
      <rdf:Description>
        <dc:description>
          <rdf:Alt>
            <rdf:li xml:lang="x-default">t3 inside!</rdf:li>
          </rdf:Alt>
        </dc:description>
      </rdf:Description>
    </rdf:RDF>
  `;
  assert.equal(extractAltTextFromXmp(xmp), "t3 inside!");
});
