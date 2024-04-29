import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  CreateAxiosDefaults
} from 'axios';
import { HTTP_METHODS, RESTLI_METHODS } from './utils/constants';
import { getPatchObject } from './utils/patch-generator';
import { encode, paramEncode } from './utils/encoder';
import { getCreatedEntityId, encodeQueryParamsForGetRequests } from './utils/restli-utils';
import { buildRestliUrl, getRestliRequestHeaders } from './utils/api-utils';
import {
  maybeApplyQueryTunnelingToRequestsWithoutBody,
  maybeApplyQueryTunnelingToRequestsWithBody
} from './utils/query-tunneling';
import _ from 'lodash';
import { logSuccess, logError } from './utils/logging';

/**
 * Type Definitions
 */

export interface LIRestliRequestOptionsBase {
  /**
   * The resource path after the base URL, beginning with a forward slash. If the path contains keys,
   * add curly-brace placeholders for the keys and specify the path key-value map in the `pathKeys` argument.
   */
  resourcePath: string;
  /** The access token that should provide the application access to the specified API */
  accessToken: string;
  /**
   * If there are path keys that are part of the `resourcePath` argument, the key placeholders must be specified in
   * the provided `pathKeys` map. The path key values can be strings, numbers, or objects, and these
   * will be properly encoded.
   */
  pathKeys?: Record<string, any>;
  /** A map of query parameters, whose keys/values should not be encoded */
  queryParams?: Record<string, any>;
  /** optional version string of the format "YYYYMM" or "YYYYMM.RR". If specified, the version header will be passed and the request will use the versioned APIs base URL. */
  versionString?: string | null;
  /** optional Axios request config object that will be merged into the request config. This will override any properties the client method sets, which may cause unexpected errors. Query params should not be passed here--instead they should be set in the queryParams property for proper Rest.li encoding. */
  additionalConfig?: AxiosRequestConfig;
}

/**
 * A Rest.li entity
 */
export type RestliEntity = Record<string, any>;

/**
 * A Rest.li entity id or key. The id can be a string, number, or complex key. The id should not be encoded, as the client method will perform the correct encoding.
 */
export type RestliEntityId = string | number | Record<string, any>;

/**
 * An encoded entity id
 */
export type EncodedEntityId = string | number;

/**
 * Paging metadata object
 */
export interface PagingObject {
  /** Start index of returned entities list (zero-based index) */
  start: number;
  /** Number of entities returned */
  count: number;
  /** Total number of entities */
  total?: number;
}

/**
 * Request Options Interfaces
 */

export interface LIGetRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to fetch. For simple resources, this should not be specified. */
  id?: RestliEntityId | null;
}

export interface LIBatchGetRequestOptions extends LIRestliRequestOptionsBase {
  /** The list of ids to fetch on the resource. */
  ids: RestliEntityId[];
}

export interface LIGetAllRequestOptions extends LIRestliRequestOptionsBase {}

export interface LICreateRequestOptions extends LIRestliRequestOptionsBase {
  /** A JSON serialized value of the entity to create */
  entity: RestliEntity;
}

export interface LIBatchCreateRequestOptions extends LIRestliRequestOptionsBase {
  /** A list of JSON serialized entity values to create */
  entities: RestliEntity[];
}

export interface LIPartialUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to update. For simple resources, this is not specified. */
  id?: RestliEntityId | null;
  /** The JSON-serialized value of the entity with only the modified fields present. If specified, this will be directly sent as the patch object. */
  patchSetObject?: RestliEntity;
  /** The JSON-serialized value of the original entity. If specified and patchSetObject is not provided, this will be used in conjunction with modifiedEntity to compute the patch object. */
  originalEntity?: RestliEntity;
  /** The JSON-serialized value of the modified entity. If specified and patchSetObject is not provided, this will be used in conjunction with originalEntity to compute the patch object. */
  modifiedEntity?: RestliEntity;
}

export interface LIBatchPartialUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** A list entity ids to update. */
  ids: RestliEntityId[];
  /** A list of JSON-serialized values of the entities with only the modified fields present. If specified, this will be directly sent as the patch object. */
  patchSetObjects?: RestliEntity[];
  /** A list of JSON-serialized values of the original entities. If specified and patchSetObjects is not provided, this will be used in conjunction with modifiedEntities to compute patch object for each entity. */
  originalEntities?: RestliEntity[];
  /** A list of JSON-serialized values of the modified entities. If specified and patchSetObjects is not provided, this will be used in conjunction with originalEntities to compute the patch object for each entity. */
  modifiedEntities?: RestliEntity[];
}

export interface LIUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to update. For simple resources, this is not specified. */
  id?: RestliEntityId | null;
  /** The JSON-serialized value of the entity with updated values. */
  entity: RestliEntity;
}

export interface LIBatchUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The list of entity ids to update. This should match with the corresponding entity object in the entities field. */
  ids: RestliEntityId[];
  /** The list of JSON-serialized values of entities with updated values. */
  entities: RestliEntity[];
}

export interface LIDeleteRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to delete. For simple resources, this is not specified. */
  id?: RestliEntityId | null;
}

export interface LIBatchDeleteRequestOptions extends LIRestliRequestOptionsBase {
  /** A list of entity ids to delete. */
  ids: RestliEntityId[];
}

export interface LIFinderRequestOptions extends LIRestliRequestOptionsBase {
  /** The Rest.li finder name */
  finderName: string;
}

export interface BatchFinderCriteria {
  /** The batch finder crtieria parameter name. */
  name: string;
  /** A list of finder param objects. batch finder results are correspondingly ordered according to this list. */
  value: Array<Record<string, any>>;
}

export interface LIBatchFinderRequestOptions extends LIRestliRequestOptionsBase {
  /**
   * The Rest.li batch finder name (the value of the "bq" parameter). This will be added to the request
   * query parameters.
   */
  finderName: string;
  /**
   * An object representing the batch finder criteria information. This will be encoded and added to the
   * request query parameters.
   */
  finderCriteria: BatchFinderCriteria;
}

export interface LIActionRequestOptions extends LIRestliRequestOptionsBase {
  /** The Rest.li action name */
  actionName: string;
  /** The request body data to pass to the action. */
  data?: Record<string, any> | null;
}

/**
 * Response Interfaces
 */

export interface LIGetResponse extends AxiosResponse {
  /** The entity that was fetched */
  data: RestliEntity;
}

export interface LIBatchGetResponse extends AxiosResponse {
  data: {
    /** A map containing entities that could not be successfully fetched and their associated error responses */
    errors: Record<EncodedEntityId, any>;
    /** A map of entities that were successfully retrieved */
    results: Record<EncodedEntityId, RestliEntity>;
    /** A map of entities and the corresponding status code */
    statuses?: Record<EncodedEntityId, number>;
  };
}

export interface LICollectionResponse extends AxiosResponse {
  data: {
    /** List of entities returned in the response. */
    elements: RestliEntity[];
    paging?: PagingObject;
    /** Optional response metadata. */
    metadata?: any;
  };
}

export interface LICreateResponse extends AxiosResponse {
  /** The decoded, created entity id */
  createdEntityId: string | string[] | Record<string, string>;
}

export interface LIBatchCreateResponse extends AxiosResponse {
  data: {
    /** A list of entity creation response data in the same order as the entities provided in the batch create request. */
    elements: Array<{
      /** The response status when creating the entity. */
      status: number;
      /** The id of the newly-created entity, if creation was successful. */
      id?: string;
      /** Error details when creating an entity, if creation failed. */
      error?: any;
    }>;
  };
}

export interface LIPartialUpdateResponse extends AxiosResponse {}

export interface LIUpdateResponse extends AxiosResponse {}

export interface LIBatchUpdateResponse extends AxiosResponse {
  data: {
    /** A map where the keys are the encoded entity ids that were successfully updated, and the values are the update results, which include the status code. */
    results: Record<
      EncodedEntityId,
      {
        status: number;
      }
    >;
    /** A map where the keys are the encoded entity ids that failed to be updated, and the values include the error response. */
    errors: Record<EncodedEntityId, any>;
  };
}

export interface LIDeleteResponse extends AxiosResponse {}

export interface LIBatchDeleteResponse extends AxiosResponse {
  data: {
    /** A map where the keys are the encoded entity ids that were successfully deleted, and the values are the delete results, which include the status code. */
    results: Record<
      EncodedEntityId,
      {
        status: number;
      }
    >;
    /** A map where the keys are the encoded entity ids that failed to be deleted, and the values include the error response. */
    errors: Record<EncodedEntityId, any>;
  };
}

export interface LIBatchFinderResponse extends AxiosResponse {
  data: {
    /** An array of finder search results in the same order as the array of search criteria provided to the batch finder. */
    elements: Array<{
      /** An array of entities found based on the corresponding search critieria. */
      elements: RestliEntity[];
      paging?: PagingObject;
      metadata?: any;
      error?: any;
      /** Flag indicating whether the finder request encountered an error. */
      isError?: boolean;
    }>;
  };
}

export interface LIActionResponse extends AxiosResponse {
  data: {
    /** The action response value. */
    value: boolean | string | number | Record<string, any>;
  };
}

export class RestliClient {
  axiosInstance: AxiosInstance;
  #debugEnabled = false;
  #logSuccessResponses = false;

  constructor(config: CreateAxiosDefaults = {}) {
    this.axiosInstance = axios.create(config);

    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (this.#debugEnabled && this.#logSuccessResponses) {
          logSuccess(response);
        }
        return response;
      },
      async (error) => {
        if (this.#debugEnabled) {
          logError(error);
        }
        return await Promise.reject(error);
      }
    );
  }

  /**
   * Set debug logging parameters for the client.
   */
  setDebugParams({
    /** Flag whether to enable debug logging of request responses */
    enabled = false,
    /** Flag whether to log successful responses */
    logSuccessResponses = false
  }): void {
    this.#debugEnabled = enabled;
    this.#logSuccessResponses = logSuccessResponses;
  }

  /**
   * Makes a Rest.li GET request to fetch the specified entity on a resource. This method
   * will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.get({
   *   resourcePath: '/adAccounts/{id}',
   *   pathKeys: {
   *     id: 123
   *   },
   *   queryParams: {
   *     fields: 'id,name'
   *   },
   *   accessToken: 'ABC123',
   *   versionString: '202210'
   * }).then(response => {
   *   const entity = response.data;
   * });
   * ```
   *
   * @returns a Promise that resolves to the response object containing the entity.
   */
  async get({
    resourcePath,
    accessToken,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    additionalConfig = {}
  }: LIGetRequestOptions): Promise<LIGetResponse> {
    const encodedQueryParamString = encodeQueryParamsForGetRequests(queryParams);
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.GET,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li BATCH_GET request to fetch multiple entities on a resource. This method
   * will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.batchGet({
   *   resourcePath: '/adCampaignGroups',
   *   ids: [123, 456, 789],
   *   accessToken: 'ABC123',
   *   versionString: '202210'
   * }).then(response => {
   *   const entities = response.data.results;
   * })
   * ```
   */
  async batchGet({
    resourcePath,
    ids,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchGetRequestOptions): Promise<LIBatchGetResponse> {
    const encodedQueryParamString = encodeQueryParamsForGetRequests({
      ids,
      ...queryParams
    });
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.BATCH_GET,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li GET_ALL request to fetch all entities on a resource. This method
   * will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.getAll({
   *   resourcePath: '/fieldsOfStudy',
   *   queryParams: {
   *     start: 0,
   *     count: 15
   *   },
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const entities = response.data.elements;
   * })
   * ```
   */
  async getAll({
    resourcePath,
    accessToken,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    additionalConfig = {}
  }: LIGetAllRequestOptions): Promise<LICollectionResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = encodeQueryParamsForGetRequests(queryParams);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.GET_ALL,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li FINDER request to find entities by some specified criteria. This method
   * will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * restliClient.finder({
   *   resourcePath: '/adAccounts',
   *   finderName: 'search',
   *   queryParams: {
   *     search: {
   *       status: {
   *         values: ['DRAFT', 'ACTIVE', 'REMOVED']
   *       }
   *     }
   *   },
   *   accessToken: 'ABC123',
   *   versionString: '202210'
   * }).then(response => {
   *   const elements = response.data.elements;
   *   const total = response.data.paging.total;
   * });
   * ```
   */
  async finder({
    resourcePath,
    finderName,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIFinderRequestOptions): Promise<LICollectionResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = encodeQueryParamsForGetRequests({
      q: finderName,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.FINDER,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li BATCH_FINDER request to find entities by multiple sets of
   * criteria. This method will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * restliClient.batchFinder({
   *   resourcePath: '/organizationAuthorizations',
   *   finderName: 'authorizationActionsAndImpersonator',
   *   finderCriteria: {
   *     name: 'authorizationActions',
   *     value: [
   *       {
   *         'OrganizationRoleAuthorizationAction': {
   *           actionType: 'ADMINISTRATOR_READ'
   *         }
   *       },
   *       {
   *          'OrganizationContentAuthorizationAction': {
   *           actionType: 'ORGANIC_SHARE_DELETE'
   *         }
   *       }
   *     ]
   *   },
   *   accessToken: 'ABC123',
   *   versionString: '202210'
   * }).then(response => {
   *   const allFinderResults = response.data.elements;
   * });
   * ```
   */
  async batchFinder({
    resourcePath,
    finderName,
    finderCriteria,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchFinderRequestOptions): Promise<LIBatchFinderResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = encodeQueryParamsForGetRequests({
      bq: finderName,
      [finderCriteria.name]: finderCriteria.value,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.BATCH_FINDER,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li CREATE request to create a new entity on the resource.
   *
   * @example
   * ```ts
   * client.create({
   *   resourcePath: '/adAccountsV2',
   *   entity: {
   *     name: 'Test Ad Account',
   *     type: 'BUSINESS',
   *     test: true
   *   },
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const createdId = response.createdEntityId;
   * })
   * ```
   */
  async create({
    resourcePath,
    entity,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LICreateRequestOptions): Promise<LICreateResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode(queryParams);
    const requestConfig = _.merge(
      {
        method: HTTP_METHODS.POST,
        url: encodedQueryParamString ? `${urlPath}?${encodedQueryParamString}` : urlPath,
        data: entity,
        headers: getRestliRequestHeaders({
          restliMethodType: RESTLI_METHODS.CREATE,
          accessToken,
          versionString
        })
      },
      additionalConfig
    );

    const originalResponse = await this.axiosInstance.request(requestConfig);
    return {
      ...originalResponse,
      createdEntityId: getCreatedEntityId(originalResponse, true)
    };
  }

  /**
   * Makes a Rest.li BATCH_CREATE request to create multiple entities in
   * a single call.
   *
   * @example
   * ```ts
   * client.batchCreate({
   *   resourcePath: '/adCampaignGroups',
   *   entities: [
   *     {
   *       account: 'urn:li:sponsoredAccount:111',
   *       name: 'CampaignGroupTest1',
   *       status: 'DRAFT'
   *     },
   *     {
   *       account: 'urn:li:sponsoredAccount:222',
   *       name: 'CampaignGroupTest2',
   *       status: 'DRAFT'
   *     }
   *   ],
   *   versionString: '202209',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const createdElementsInfo = response.data.elements;
   * });
   * ```
   */
  async batchCreate({
    resourcePath,
    entities,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchCreateRequestOptions): Promise<LIBatchCreateResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode(queryParams);
    const requestConfig = _.merge(
      {
        method: HTTP_METHODS.POST,
        url: encodedQueryParamString ? `${urlPath}?${encodedQueryParamString}` : urlPath,
        data: {
          elements: entities
        },
        headers: getRestliRequestHeaders({
          restliMethodType: RESTLI_METHODS.BATCH_CREATE,
          accessToken,
          versionString
        })
      },
      additionalConfig
    );
    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li PARTIAL_UPDATE request to update part of an entity. One can either
   * pass the full original and modified entity objects, with the method computing the correct
   * patch object, or one can directly pass the patch object to send in the request.
   *
   * When an entity has nested fields that can be modified, passing in the original and modified
   * entities may produce a complex patch object that is a technically correct format for the Rest.li
   * framework, but may not be supported for most LinkedIn APIs which mainly support partial
   * update of only top-level fields on an entity. In these cases it is better to specify `patchSetObject`
   * directly.
   *
   * This method will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.partialUpdate({
   *   resourcePath: '/adAccounts/{id}',
   *   pathKeys: {
   *     id: 123
   *   },
   *   patchSetObject: {
   *     name: 'TestAdAccountModified',
   *     reference: 'urn:li:organization:456'
   *   },
   *   versionString: '202209',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   ...
   * });
   * ```
   */
  async partialUpdate({
    resourcePath,
    patchSetObject,
    originalEntity,
    modifiedEntity,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIPartialUpdateRequestOptions): Promise<LIPartialUpdateResponse> {
    const encodedQueryParamString = paramEncode(queryParams);
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);

    let patchData;
    if (patchSetObject) {
      if (typeof patchSetObject === 'object' && Object.keys(patchSetObject).length === 0) {
        throw new Error('patchSetObject must be an object with at least one key-value pair');
      }
      patchData = { patch: { $set: patchSetObject } };
    } else if (originalEntity && modifiedEntity) {
      patchData = getPatchObject(originalEntity, modifiedEntity);
      if (!patchData || Object.keys(patchData).length === 0) {
        throw new Error('There must be a difference between originalEntity and modifiedEntity');
      }
    } else {
      throw new Error(
        'Either patchSetObject or originalEntity and modifiedEntity properties must be present'
      );
    }

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.PARTIAL_UPDATE,
      originalJSONRequestBody: patchData,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li BATCH_PARTIAL_UPDATE request to partially update multiple entites at
   * once. This method will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.batchPartialUpdate({
   *   resourcePath: '/adCampaignGroups',
   *   ids: [123, 456],
   *   patchSetObjects: [
   *     { status: 'ACTIVE' },
   *     {
   *       runSchedule: {
   *         start: 1678029270721,
   *         end: 1679029270721
   *       }
   *     }
   *   ],
   *   versionString: '202209',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const results = response.data.results;
   * })
   * ```
   */
  async batchPartialUpdate({
    resourcePath,
    ids,
    originalEntities,
    modifiedEntities,
    patchSetObjects,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchPartialUpdateRequestOptions): Promise<LIBatchUpdateResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);

    if (patchSetObjects) {
      if (ids.length !== patchSetObjects.length) {
        throw new Error('The fields { ids, patchSetObjects } must be arrays with the same length');
      }
    } else if (originalEntities && modifiedEntities) {
      if (
        ids.length !== originalEntities.length &&
        originalEntities.length !== modifiedEntities.length
      ) {
        throw new Error(
          'The fields { ids, originalEntities, modifiedEntities } must be arrays with the same length'
        );
      }
    } else {
      throw new Error(
        'Either { patchSetObjects } or { originalEntities, modifiedEntities } need to be provided as input parameters'
      );
    }

    const encodedQueryParamString = paramEncode({
      ids,
      ...queryParams
    });
    let entities;

    if (patchSetObjects) {
      entities = ids.reduce((prev, curr, index) => {
        const encodedEntityId = encode(curr);
        prev[encodedEntityId] = {
          patch: { $set: patchSetObjects[index] }
        };
        return prev;
      }, {});
    } else if (originalEntities && modifiedEntities) {
      entities = ids.reduce((prev, curr, index) => {
        const encodedEntityId = encode(curr);
        prev[encodedEntityId] = getPatchObject(originalEntities[index], modifiedEntities[index]);
        return prev;
      }, {});
    }

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.BATCH_PARTIAL_UPDATE,
      originalJSONRequestBody: {
        entities
      },
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li UPDATE request to update an entity (overwriting the entire entity).
   * This method will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.update({
   *   resourcePath: '/adAccountUsers/{accountUserKey}',
   *   pathKeys: {
   *     accountUserKey: {
   *       account: 'urn:li:sponsoredAccount:123',
   *       user: 'urn:li:person:foobar'
   *     }
   *   },
   *   entity: {
   *     account: 'urn:li:sponsoredAccount:123',
   *     user: 'urn:li:person:foobar',
   *     role: 'VIEWER'
   *   },
   *   versionString: '202209',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   ...
   * });
   * ```
   */
  async update({
    resourcePath,
    entity,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIUpdateRequestOptions): Promise<LIUpdateResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode(queryParams);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.UPDATE,
      originalJSONRequestBody: entity,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li BATCH_UPDATE request to update multiple entities in a single call.
   * This method will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.batchUpdate({
   *   resourcePath: '/campaignConversions',
   *   ids: [
   *     { campaign: 'urn:li:sponsoredCampaign:123', conversion: 'urn:lla:llaPartnerConversion:456' },
   *     { campaign: 'urn:li:sponsoredCampaign:123', conversion: 'urn:lla:llaPartnerConversion:789' }
   *   ],
   *   entities: [
   *     { campaign: 'urn:li:sponsoredCampaign:123', conversion: 'urn:lla:llaPartnerConversion:456' },
   *     { campaign: 'urn:li:sponsoredCampaign:123', conversion: 'urn:lla:llaPartnerConversion:789' }
   *   ],
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const results = response.data.results;
   * })
   * ```
   */
  async batchUpdate({
    resourcePath,
    ids,
    entities,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchUpdateRequestOptions): Promise<LIBatchUpdateResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode({
      ids,
      ...queryParams
    });
    // This as any[] workaround is due to this issue: https://github.com/microsoft/TypeScript/issues/36390
    const entitiesObject = (ids as any[]).reduce((entitiesObject, currId, index) => {
      entitiesObject[encode(currId)] = entities[index];
      return entitiesObject;
    }, {});

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.BATCH_UPDATE,
      originalJSONRequestBody: {
        entities: entitiesObject
      },
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li DELETE request to delete an entity
   *
   * @sample
   * ```ts
   * restliClient.delete({
   *   resourcePath: '/adAccounts/{id}',
   *   pathKeys: {
   *     id: 123
   *   },
   *   versionString: '202210',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const status = response.status;
   * });
   * ```
   */
  async delete({
    resourcePath,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIDeleteRequestOptions): Promise<LIDeleteResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode(queryParams);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.DELETE,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li BATCH_DELETE request to delete multiple entities at once.
   *
   * @sample
   * ```ts
   * restliClient.batchDelete({
   *   resourcePath: '/adAccounts',
   *   ids: [123, 456],
   *   versionString: '202210',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const results = response.data.results;
   * });
   * ```
   */
  async batchDelete({
    resourcePath,
    ids,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchDeleteRequestOptions): Promise<LIBatchDeleteResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode({
      ids,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath,
      originalRestliMethod: RESTLI_METHODS.BATCH_DELETE,
      accessToken,
      versionString,
      additionalConfig
    });

    return await this.axiosInstance.request(requestConfig);
  }

  /**
   * Makes a Rest.li ACTION request to perform an action on a specified resource
   *
   * @example
   * ```ts
   * restliClient.action({
   *   resource: 'testResource',
   *   actionName: 'doSomething'
   *   data: {
   *     additionalParam: 123
   *   },
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const result = response.data.value;
   * })
   * ```
   */
  async action({
    resourcePath,
    actionName,
    data = null,
    pathKeys = {},
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig
  }: LIActionRequestOptions): Promise<LIActionResponse> {
    const urlPath = buildRestliUrl(resourcePath, pathKeys, versionString);
    const encodedQueryParamString = paramEncode({
      action: actionName,
      ...queryParams
    });
    const requestConfig = _.merge({
      method: HTTP_METHODS.POST,
      url: `${urlPath}?${encodedQueryParamString}`,
      data,
      headers: getRestliRequestHeaders({
        restliMethodType: RESTLI_METHODS.ACTION,
        accessToken,
        versionString
      }),
      additionalConfig
    });
    return await this.axiosInstance.request(requestConfig);
  }
}
