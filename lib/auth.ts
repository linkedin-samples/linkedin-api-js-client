import axios from 'axios';
import { HEADERS, CONTENT_TYPE, HTTP_METHODS, OAUTH_BASE_URL } from './utils/constants';
import qs from 'qs';
import { generateMemberAuthorizationUrl } from './utils/oauth-utils';

export interface AccessToken2LResponse {
  /** The two-legged access token */
  access_token: string;
  /** The TTL of the access token, in seconds */
  expires_in: number;
}

export interface RefreshTokenExchangeResponse {
  /** The 3-legged access token */
  access_token: string;
  /** The TTL for the access token, in seconds */
  expires_in: number;
  /** The refresh token value */
  refresh_token: string;
  /** The TTL for the refresh token, in seconds */
  refresh_token_expires_in: number;
}

export interface AccessToken3LResponse {
  /** The 3-legged access token */
  access_token: string;
  /** The TTL for the access token, in seconds */
  expires_in: number;
  /** The refresh token value */
  refresh_token?: string;
  /** The TTL for the refresh token, in seconds */
  refresh_token_expires_in?: number;
  /** A comma-separated list of scopes authorized by the member (e.g. "r_liteprofile,r_ads") */
  scope: string;
  /** returned when the `openid` scope is sepecified A JSON Web Token (JWT). */
  id_token?: string;
  /** usually a `Bearer` token */
  token_type?: string;
}

enum TokenAuthType {
  /** 2-legged application token */
  TWO_LEGGED = '2L',
  /** 3-legged member token */
  THREE_LEGGED = '3L',
  /** Enterprise member token */
  ENTERPRISE = 'Enterprise_User'
}

enum TokenStatus {
  /** Token has been revoked */
  REVOKED = 'revoked',
  /** Token has expired */
  EXPIRED = 'expired',
  /** Token is active */
  ACTIVE = 'active'
}

export interface IntrospectTokenResponse {
  /** Flag whether the token is a valid, active token. */
  active: boolean;
  /** The auth type of the token */
  auth_type: TokenAuthType;
  /** Epoch time in seconds, indicating when the token was authorized */
  authorized_at?: number;
  /** Developer application client ID */
  client_id?: string;
  /** Epoch time in seconds, indicating when this token was originally issued */
  created_at: number;
  /** Epoch time in seconds, indicating when this token will expire */
  expires_at?: number;
  /** A string containing a comma-separated list of scopes associated with this token. This is only returned for 3-legged member tokens. */
  scope?: string;
  /** The token status */
  status?: TokenStatus;
}

/**
 * A simple auth client for managing OAuth 2.0 authorization flows for LinkedIn APIs.
 */
export class AuthClient {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;

  constructor(params: {
    /** The client ID of the developer application. */
    clientId: string;
    /** The client secret of the developer application. */
    clientSecret: string;
    /** The redirect URL. This URL is used in the authorization code flow (3-legged OAuth).
     * Users will be redirected to this URL after authorization. */
    redirectUrl?: string;
  }) {
    this.clientId = params.clientId;
    this.clientSecret = params.clientSecret;
    this.redirectUrl = params.redirectUrl;
  }

  /**
   * Use client credential flow (2-legged OAuth) to retrieve a 2-legged access token for
   * accessing APIs that are not member-specific. Developer applications do not have the client
   * credential flow enabled by default.
   *
   * @returns A promise that resolves to the 2-legged access token details
   */
  async getTwoLeggedAccessToken(): Promise<AccessToken2LResponse> {
    const response = await axios.request({
      method: HTTP_METHODS.POST,
      url: `${OAUTH_BASE_URL}/accessToken`,
      data: qs.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }),
      headers: {
        [HEADERS.CONTENT_TYPE]: CONTENT_TYPE.URL_ENCODED
      }
    });
    return response.data;
  }

  /**
   * Generates the member authorization URL to direct members to. Once redirected, the member will be
   * presented with LinkedIn's OAuth consent page showing the OAuth scopes your application is requesting
   * on behalf of the user.
   *
   * @returns The member authorization URL
   */
  generateMemberAuthorizationUrl(
    /** An array of OAuth scopes (3-legged member permissions) your application is requesting on behalf of the user. */
    scopes: string[],
    /** An optional string that can be provided to test against CSRF attacks. */
    state: string = undefined
  ): string {
    return generateMemberAuthorizationUrl({
      clientId: this.clientId,
      redirectUrl: this.redirectUrl,
      state,
      scopes
    });
  }

  /**
   * Exchanges an authorization code for a 3-legged access token. After member authorization, the browser redirects to the
   * provided redirect URL, setting the authorization code on the `code` query parameter.
   *
   * @returns a Promise that resolves to details of the 3-legged access token.
   */
  async exchangeAuthCodeForAccessToken(
    /** The authorization code to exchange for an access token */
    code: string
  ): Promise<AccessToken3LResponse> {
    const response = await axios.request({
      method: HTTP_METHODS.POST,
      url: `${OAUTH_BASE_URL}/accessToken`,
      data: {
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUrl
      },
      headers: {
        [HEADERS.CONTENT_TYPE]: CONTENT_TYPE.URL_ENCODED
      }
    });
    return response.data;
  }

  /**
   * Exchanges a refresh token for a new 3-legged access token. This allows access tokens
   * to be refreshed without having the member reauthorize your application.
   *
   * @returns a Promise that resolves to an object containing the details of the new access token
   * and refresh token
   */
  async exchangeRefreshTokenForAccessToken(
    /** The refresh token to exchange for an access token. */
    refreshToken: string
  ): Promise<RefreshTokenExchangeResponse> {
    const response = await axios.request({
      method: HTTP_METHODS.POST,
      url: `${OAUTH_BASE_URL}/accessToken`,
      data: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      },
      headers: {
        [HEADERS.CONTENT_TYPE]: CONTENT_TYPE.URL_ENCODED
      }
    });
    return response.data;
  }

  /**
   * Introspect a 2-legged, 3-legged or Enterprise access token to get information on status,
   * expiry, and other details.
   *
   * @returns a Promise that resolves to the token introspection details.
   */
  async introspectAccessToken(
    /** A 2-legged, 3-legged or Enterprise access token. */
    accessToken: string
  ): Promise<IntrospectTokenResponse> {
    return await axios.request({
      method: HTTP_METHODS.POST,
      url: `${OAUTH_BASE_URL}/introspectToken`,
      data: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token: accessToken
      },
      headers: {
        [HEADERS.CONTENT_TYPE]: CONTENT_TYPE.URL_ENCODED
      }
    });
  }
}
