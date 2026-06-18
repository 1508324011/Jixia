import { expect, test } from "@playwright/test";

import {
  acceptInvitationThroughUi,
  authMeStatus,
  collectApiRequestsWithAuthorization,
  createProjectThroughUi,
  identityFor,
  loginThroughUi,
  logoutCurrentDeviceThroughApi
} from "./helpers";

test("accepts invitation logs in with cookie session and creates a project", async ({ page }, testInfo) => {
  const authorizationHeaderRequests = collectApiRequestsWithAuthorization(page);
  const identity = identityFor(testInfo, "auth-project");
  const projectName = `Cookie session project ${testInfo.retry}`;

  await acceptInvitationThroughUi(page, identity);
  await expect.poll(() => authMeStatus(page)).toBe(200);

  await logoutCurrentDeviceThroughApi(page);
  await loginThroughUi(page, identity);
  await createProjectThroughUi(page, projectName);
  await logoutCurrentDeviceThroughApi(page);

  expect(authorizationHeaderRequests).toEqual([]);
});
