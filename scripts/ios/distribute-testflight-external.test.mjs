import assert from "node:assert/strict";
import { generateKeyPairSync, verify as verifyBytes } from "node:crypto";
import test from "node:test";

import {
  createAppStoreConnectToken,
  extractTestFlightUrl,
  selectExternalVerificationBuild,
  selectUploadedBuild,
  selectSupersededGroupBuilds,
  sortBuildsByUploadedDateDescending,
  verifyPublicLinks,
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

test("verifies the exact build assigned to External Beta", () => {
  const externalBuilds = [
    { id: "external-14", attributes: { version: "14", expired: false } },
  ];

  assert.equal(
    selectExternalVerificationBuild(externalBuilds, "14").id,
    "external-14",
  );
  assert.throws(
    () => selectExternalVerificationBuild(externalBuilds, "13"),
    /External Beta does not contain active build 13/,
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

test("sorts App Store Connect builds locally by newest upload", () => {
  const builds = [
    {
      id: "older",
      attributes: { uploadedDate: "2026-08-01T20:01:00Z" },
    },
    {
      id: "missing-date",
      attributes: {},
    },
    {
      id: "newer",
      attributes: { uploadedDate: "2026-08-01T20:02:00Z" },
    },
  ];

  assert.deepEqual(
    sortBuildsByUploadedDateDescending(builds).map((build) => build.id),
    ["newer", "older", "missing-date"],
  );
  assert.deepEqual(builds.map((build) => build.id), [
    "older",
    "missing-date",
    "newer",
  ]);
});

test("extracts the TestFlight target from the TesterBuddy wrapper", () => {
  const html = `const TEST_URL = 'https://testflight.apple.com/join/rVmv2VAF';`;
  assert.equal(
    extractTestFlightUrl(html),
    "https://testflight.apple.com/join/rVmv2VAF",
  );
  assert.equal(extractTestFlightUrl("<html>no link</html>"), null);
});

test("accepts Apple's generic fallback when it preserves the configured join link", async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      String(url).includes("testerbuddy.app")
        ? `const TEST_URL = '${"https://testflight.apple.com/join/rVmv2VAF"}';`
        : `<meta name="apple-itunes-app" content="app-argument=${"https://testflight.apple.com/join/rVmv2VAF"}"><span>This beta isn't accepting any new testers right now.</span>`,
  });

  await assert.doesNotReject(
    verifyPublicLinks({ fetchImpl, requireAppIdentification: false }),
  );
  await assert.doesNotReject(
    verifyPublicLinks({ fetchImpl, requireAppIdentification: true }),
  );
});

test("rejects a public TestFlight response that identifies neither the app nor join link", async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      String(url).includes("testerbuddy.app")
        ? `const TEST_URL = '${"https://testflight.apple.com/join/rVmv2VAF"}';`
        : "<html><title>TestFlight - Apple</title></html>",
  });

  await assert.doesNotReject(
    verifyPublicLinks({ fetchImpl, requireAppIdentification: false }),
  );
  await assert.rejects(
    verifyPublicLinks({ fetchImpl, requireAppIdentification: true }),
    /does not identify Custody Folio/,
  );
});

test("selects every public build except the exact release build for removal", () => {
  const builds = ["55", "56", "60"].map((version) => ({
    id: `build-${version}`,
    attributes: { version },
  }));

  assert.deepEqual(
    selectSupersededGroupBuilds(builds, "build-60").map((build) => build.id),
    ["build-55", "build-56"],
  );
  assert.deepEqual(selectSupersededGroupBuilds([builds[2]], "build-60"), []);
});
