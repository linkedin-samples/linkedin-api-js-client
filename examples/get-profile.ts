/**
 * Example call to fetch the member profile for the authorized member.
 * The 3-legged member access token should include the 'r_liteprofile' scope, which
 * is part of the Sign In With LinkedIn API product.
 */

import { RestliClient } from 'linkedin-api-client';
import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const restliClient = new RestliClient();
  restliClient.setDebugParams({ enabled: true });
  const accessToken = process.env.ACCESS_TOKEN || '';

  /**
   * Basic usage
   */
  let response = await restliClient.get({
    resource: '/me',
    accessToken
  });
  console.log(response.data);

  /**
   * With field projection to limit fields returned
   */
  response = await restliClient.get({
    resource: '/me',
    queryParams: {
      fields: 'id,firstName,lastName'
    },
    accessToken
  });
  console.log(response.data);

  /**
   * With decoration of displayImage
   */
  response = await restliClient.get({
    resource: '/me',
    queryParams: {
      projection: '(id,firstName,lastName,profilePicture(displayImage~:playableStreams))'
    },
    accessToken
  });
  console.log(response.data);
}

await main();
