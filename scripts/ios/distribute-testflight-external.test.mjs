import assert from "node:assert/strict";
import { generateKeyPairSync, verify as verifyBytes } from "node:crypto";
import test from "node:test";

import {
  createAppStoreConnectToken,
  extractTestFlightUrl,
  selectUploadedBuild,
} from "./distribute-testflight-external.mjs";

function decodeJson(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

test("creates an Apple-compatible ES256 JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const token = createAppStoreConnectToken({
    issuerId: "issuer-id",
    keyId: "KEY123",
    privateKey,
    nowSeconds: 1_800_000_000,
  });
  const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

  assert.deepEqual(decodeJson(headerSegment), {
    alg: "ES256",
    kid: "KEY123",
    typ: "JWT",
  });
  assert.deepEqual(decodeJson(payloadSegment), {
    iss: "issuer-id",
    iat: 1_799_999_970,
    exp: 1_800_001_140,
    aud: "appstoreconnect-v1",
  });
  assert.equal(
    verifyBytes(
      "sha256",
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureSegment, "base64url"),
    ),
    true,
  );
});

test("selects one exact active build number", () => {
  const builds = [
    { id: "old", attributes: { version: "56", expired: false } },
    { id: "new", attributes: { version: "57", expired: false } },
  ];
  assert.equal(
    selectUploadedBuild(builds, { buildNumber: "57" }).id,
    "new",
  );
  assert.equal(
    selectUploadedBuild(builds, { buildNumber: "58" }),
    null,
  );
});

test("selects only the build uploaded after the release started", () => {
  const builds = [
    {
      id: "old",
      attributes: {
        version: "56",
        expired: false,
        uploadedDate: "2026-08-01T19:59:00Z",
      },
    },
    {
      id: "new",
      attributes: {
        version: "57",
        expired: false,
        uploadedDate: "2026-08-01T20:05:00Z",
      },
    },
  ];
  assert.equal(
    selectUploadedBuild(builds, {
      uploadedAfter: "2026-08-01T20:00:00Z",
    }).id,
    "new",
  );
});

test("refuses to guess when two builds were uploaded in the release window", () => {
  const builds = ["57", "58"].map((version, index) => ({
    id: version,
    attributes: {
      version,
      expired: false,
      uploadedDate: `2026-08-01T20:0${index + 1}:00Z`,
    },
  }));
  assert.throws(
    () =>
      selectUploadedBuild(builds, {
        uploadedAfter: "2026-08-01T20:00:00Z",
      }),
    /refusing to guess/,
  );
});

test("extracts the TestFlight target from the TesterBuddy wrapper", () => {
  const html = `const TEST_URL = 'https://testflight.apple.com/join/rVmv2VAF';`;
  assert.equal(
    extractTestFlightUrl(html),
    "https://testflight.apple.com/join/rVmv2VAF",
  );
  assert.equal(extractTestFlightUrl("<html>no link</html>"), null);
});
