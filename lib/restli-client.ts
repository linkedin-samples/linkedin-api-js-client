import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, CreateAxiosDefaults } from 'axios';
import { RESTLI_METHODS } from './utils/constants';
import { getPatchObject } from './utils/patch-generator';
import { encode, paramEncode } from './utils/encoder';
import { getCreatedEntityId } from './utils/restli-utils';
import { getRestApiBaseUrl, getRestliRequestHeaders } from './utils/api-utils';
import { maybeApplyQueryTunnelingToRequestsWithoutBody, maybeApplyQueryTunnelingToRequestsWithBody } from './utils/query-tunneling';
import _ from 'lodash';

/**
 * Type Definitions
 */

export interface LIRestliRequestOptionsBase {
  /** The API resource name (e.g. "/adAccounts") */
  resource: string,
  /** A map of query parameters, whose keys/values should not be encoded */
  queryParams?: Record<string, any>,
  /** The access token that should provide the application access to the specified API */
  accessToken: string,
  /** optional version string of the format "YYYYMM" or "YYYYMM.RR". If specified, the version header will be passed and the request will use the versioned APIs base URL. */
  versionString?: string,
  /** optional Axios request config object that will be merged into the request config. This will override any properties the client method sets, which may cause unexpected errors. Query params should not be passed here--instead they should be set in the queryParams property for proper Rest.li encoding. */
  additionalConfig?: AxiosRequestConfig
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
  start: number,
  /** Number of entities returned */
  count: number,
  /** Total number of entities */
  total?: number
}

/**
 * Request Options Interfaces
 */

export interface LIGetRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to fetch. For simple resources, this should not be specified. */
  id?: RestliEntityId
}

export interface LIBatchGetRequestOptions extends LIRestliRequestOptionsBase {
  /** The list of ids to fetch on the resource. */
  ids: RestliEntityId[]
}

export interface LIGetAllRequestOptions extends LIRestliRequestOptionsBase {}

export interface LICreateRequestOptions extends LIRestliRequestOptionsBase {
  /** A JSON serialized value of the entity to create */
  entity: RestliEntity
}

export interface LIBatchCreateRequestOptions extends LIRestliRequestOptionsBase {
  /** A list of JSON serialized entity values to create */
  entities: RestliEntity[]
}

export interface LIPartialUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to update. For simple resources, this is not specified. */
  id?: RestliEntityId,
  /** The JSON-serialized value of the entity with only the modified fields present. If specified, this will be directly sent as the patch object. */
  patchSetObject?: RestliEntity,
  /** The JSON-serialized value of the original entity. If specified and patchSetObject is not provided, this will be used in conjunction with modifiedEntity to compute the patch object. */
  originalEntity?: RestliEntity,
  /** The JSON-serialized value of the modified entity. If specified and patchSetObject is not provided, this will be used in conjunction with originalEntity to compute the patch object. */
  modifiedEntity?: RestliEntity
}

export interface LIBatchPartialUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** A list entity ids to update. */
  ids: RestliEntityId[],
  /** A list of JSON-serialized values of the entities with only the modified fields present. If specified, this will be directly sent as the patch object. */
  patchSetObjects?: RestliEntity[],
  /** A list of JSON-serialized values of the original entities. If specified and patchSetObjects is not provided, this will be used in conjunction with modifiedEntities to compute patch object for each entity. */
  originalEntities?: RestliEntity[],
  /** A list of JSON-serialized values of the modified entities. If specified and patchSetObjects is not provided, this will be used in conjunction with originalEntities to compute the patch object for each entity. */
  modifiedEntities?: RestliEntity[]
}

export interface LIUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to update. For simple resources, this is not specified. */
  id?: RestliEntityId,
  /** The JSON-serialized value of the entity with updated values. */
  entity: RestliEntity
}

export interface LIBatchUpdateRequestOptions extends LIRestliRequestOptionsBase {
  /** The list of entity ids to update. This should match with the corresponding entity object in the entities field. */
  ids: RestliEntityId[],
  /** The list of JSON-serialized values of entities with updated values. */
  entities: RestliEntity[]
}

export interface LIDeleteRequestOptions extends LIRestliRequestOptionsBase {
  /** The id or key of the entity to delete. For simple resources, this is not specified. */
  id?: RestliEntityId
}

export interface LIBatchDeleteRequestOptions extends LIRestliRequestOptionsBase {
  /** A list of entity ids to delete. */
  ids: RestliEntityId[]
}

export interface LIFinderRequestOptions extends LIRestliRequestOptionsBase {
  /** The Rest.li finder name */
  finderName: string
}

export interface LIBatchFinderRequestOptions extends LIRestliRequestOptionsBase {
  /** The Rest.li batch finder name */
  batchFinderName: string
}

export interface LIActionRequestOptions extends LIRestliRequestOptionsBase {
  /** The Rest.li action name */
  actionName: string,
  /** The request body data to pass to the action. */
  data?: Record<string, any>
}

/**
 * Response Interfaces
 */

export interface LIGetResponse extends AxiosResponse {
  /** The entity that was fetched */
  data: RestliEntity
}

export interface LIBatchGetResponse extends AxiosResponse {
  data: {
    /** A map containing entities that could not be successfully fetched and their associated error responses */
    errors: Record<EncodedEntityId, any>,
    /** A map of entities that were successfully retrieved */
    results: Record<EncodedEntityId, RestliEntity>,
    /** A map of entities and the corresponding status code */
    statuses?: Record<EncodedEntityId, number>
  }
}

export interface LIGetAllResponse extends AxiosResponse {
  data: {
    /** List of entities */
    elements: RestliEntity[],
    paging?: PagingObject
  }
}

export interface LICreateResponse extends AxiosResponse {
  /** The decoded, created entity id */
  createdEntityId: string | string[] | Record<string, string>
}

export interface LIBatchCreateResponse extends AxiosResponse {
  data: {
    /** A list of entity creation response data in the same order as the entities provided in the batch create request. */
    elements: Array<{
      /** The response status when creating the entity. */
      status: number,
      /** The id of the newly-created entity, if creation was successful. */
      id?: string,
      /** Error details when creating an entity, if creation failed. */
      error?: any
    }>
  }
}

export interface LIPartialUpdateResponse extends AxiosResponse {}

export interface LIBatchPartialUpdateResponse extends AxiosResponse {
  data: {
    /** A map of entities and their corresponding response status. */
    results: Record<EncodedEntityId, {
      status: number
    }>,
    /** A map where the keys are the encoded entity ids that failed to be updated, and the values include the error response. */
    errors: Record<EncodedEntityId, any>
  }
}

export interface LIUpdateResponse extends AxiosResponse {}

export interface LIBatchUpdateResponse extends AxiosResponse {
  data: {
    /** A map where the keys are the encoded entity ids that were successfully updated, and the values are the update results, which include the status code. */
    results: Record<EncodedEntityId, {
      status: number
    }>,
    /** A map where the keys are the encoded entity ids that failed to be updated, and the values include the error response. */
    errors: Record<EncodedEntityId, any>
  }
}

export interface LIDeleteResponse extends AxiosResponse {}

export interface LIBatchDeleteResponse extends AxiosResponse {
  data: {
    /** A map where the keys are the encoded entity ids that were successfully deleted, and the values are the delete results, which include the status code. */
    results: Record<EncodedEntityId, {
      status: number
    }>,
    /** A map where the keys are the encoded entity ids that failed to be deleted, and the values include the error response. */
    errors: Record<EncodedEntityId, any>
  }
}

export interface LIFinderResponse extends AxiosResponse {
  data: {
    /** An array of entities found based on the search criteria */
    elements: RestliEntity[],
    paging?: PagingObject
  }
}

export interface LIBatchFinderResponse extends AxiosResponse {
  data: {
    /** An array of finder search results in the same order as the array of search criteria provided to the batch finder. */
    elements: Array<{
      /** An array of entities found based on the corresponding search critieria. */
      elements: RestliEntity[],
      paging?: PagingObject,
      metadata?: any,
      error?: any,
      /** Flag indicating whether the finder request encountered an error. */
      isError?: boolean
    }>
  }
}

export interface LIActionResponse extends AxiosResponse {
  data: {
    /** The action response value. */
    value: boolean | string | number | Record<string, any>
  }
}

export class RestliClient {
  axiosInstance: AxiosInstance;

  constructor(config: CreateAxiosDefaults = {}) {
    this.axiosInstance = axios.create(config);
  }

  /**
   * Makes a Rest.li GET request to fetch the specified entity on a resource. This method
   * will perform query tunneling if necessary.
   *
   * @example
   * ```ts
   * client.get({
   *   resource: '/adAccounts',
   *   id: 123,
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
    resource,
    id = null,
    queryParams,
    versionString,
    accessToken,
    additionalConfig
  }: LIGetRequestOptions): Promise<LIGetResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode(queryParams);
    // Simple resources do not have id
    const urlPath = id ? `${baseUrl}${resource}/${encode(id)}` : `${baseUrl}${resource}`;

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
   *   resource: '/adCampaignGroups',
   *   ids: [123, 456, 789],
   *   accessToken: 'ABC123',
   *   versionString: '202210'
   * }).then(response => {
   *   const entities = response.data.results;
   * })
   * ```
   */
  async batchGet({
    resource,
    ids,
    queryParams,
    versionString,
    accessToken,
    additionalConfig = {}
  }: LIBatchGetRequestOptions): Promise<LIBatchGetResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode({
      ids,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
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
   *   resource: '/fieldsOfStudy',
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
    resource,
    queryParams,
    versionString,
    accessToken,
    additionalConfig
  }: LIGetAllRequestOptions): Promise<LIGetAllResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode(queryParams);

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
      originalRestliMethod: RESTLI_METHODS.GET_ALL,
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
   *   resource: '/adAccountsV2',
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
    resource,
    entity,
    queryParams,
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LICreateRequestOptions): Promise<LICreateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode(queryParams);
    const requestConfig = _.merge({
      method: 'POST',
      url: encodedQueryParamString
        ? `${baseUrl}${resource}?${encodedQueryParamString}`
        : `${baseUrl}${resource}`,
      data: entity,
      headers: getRestliRequestHeaders({
        restliMethodType: RESTLI_METHODS.CREATE,
        accessToken,
        versionString
      })
    }, additionalConfig);

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
   *   resource: '/adCampaignGroups',
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
    resource,
    entities,
    queryParams,
    versionString,
    accessToken,
    additionalConfig = {}
  }: LIBatchCreateRequestOptions): Promise<LIBatchCreateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode(queryParams);
    const requestConfig = _.merge({
      method: 'POST',
      url: encodedQueryParamString
        ? `${baseUrl}${resource}?${encodedQueryParamString}`
        : `${baseUrl}${resource}`,
      data: {
        elements: entities
      },
      headers: getRestliRequestHeaders({
        restliMethodType: RESTLI_METHODS.BATCH_CREATE,
        accessToken,
        versionString
      })
    }, additionalConfig);
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
   *   resource: '/adAccounts',
   *   id: '123',
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
    resource,
    id = null,
    patchSetObject,
    originalEntity,
    modifiedEntity,
    queryParams,
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIPartialUpdateRequestOptions): Promise<LIPartialUpdateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const urlPath = id ? `${baseUrl}${resource}/${encode(id)}` : `${baseUrl}${resource}`;
    const encodedQueryParamString = paramEncode(queryParams);

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
      throw new Error('Either patchSetObject or originalEntity and modifiedEntity properties must be present');
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
   *   resource: '/adCampaignGroups',
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
    resource,
    ids,
    originalEntities,
    modifiedEntities,
    patchSetObjects,
    queryParams,
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchPartialUpdateRequestOptions): Promise<LIBatchPartialUpdateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);

    if (patchSetObjects) {
      if (ids.length !== patchSetObjects.length) {
        throw new Error('The fields { ids, patchSetObjects } must be arrays with the same length');
      }
    } else if (originalEntities && modifiedEntities) {
      if (ids.length !== originalEntities.length && originalEntities.length !== modifiedEntities.length) {
        throw new Error('The fields { ids, originalEntities, modifiedEntities } must be arrays with the same length');
      }
    } else {
      throw new Error('Either { patchSetObjects } or { originalEntities, modifiedEntities } need to be provided as input parameters');
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
    } else {
      entities = ids.reduce((prev, curr, index) => {
        const encodedEntityId = encode(curr);
        prev[encodedEntityId] = getPatchObject(originalEntities[index], modifiedEntities[index]);
        return prev;
      }, {});
    }

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
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
   *   resource: '/adAccountUsers',
   *   id: {
   *     account: 'urn:li:sponsoredAccount:123',
   *     user: 'urn:li:person:foobar'
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
    resource,
    id = null,
    entity,
    queryParams,
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIUpdateRequestOptions): Promise<LIUpdateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const urlPath = id ? `${baseUrl}${resource}/${encode(id)}` : `${baseUrl}${resource}`;
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
   *   resource: '/campaignConversions',
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
    resource,
    ids,
    entities,
    queryParams,
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchUpdateRequestOptions): Promise<LIBatchUpdateResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
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
      urlPath: `${baseUrl}${resource}`,
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
   *   resource: '/adAccounts',
   *   id: 123,
   *   versionString: '202210',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const status = response.status;
   * });
   * ```
   */
  async delete({
    resource,
    id = null,
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIDeleteRequestOptions): Promise<LIDeleteResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const urlPath = id ? `${baseUrl}${resource}/${encode(id)}` : `${baseUrl}${resource}`;
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
   *   resource: '/adAccounts',
   *   ids: [123, 456],
   *   versionString: '202210',
   *   accessToken: 'ABC123'
   * }).then(response => {
   *   const results = response.data.results;
   * });
   * ```
   */
  async batchDelete({
    resource,
    ids,
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchDeleteRequestOptions): Promise<LIBatchDeleteResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode({
      ids,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
      originalRestliMethod: RESTLI_METHODS.BATCH_DELETE,
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
   *   resource: '/adAccounts',
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
    resource,
    finderName,
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIFinderRequestOptions): Promise<LIFinderResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode({
      q: finderName,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
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
   *   resource: '/organizationAuthorizations',
   *   batchFinderName: 'authorizationActionsAndImpersonator',
   *   queryParams: {
   *     authorizationActions: [
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
    resource,
    batchFinderName,
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig = {}
  }: LIBatchFinderRequestOptions): Promise<LIBatchFinderResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode({
      bq: batchFinderName,
      ...queryParams
    });

    const requestConfig = maybeApplyQueryTunnelingToRequestsWithoutBody({
      encodedQueryParamString,
      urlPath: `${baseUrl}${resource}`,
      originalRestliMethod: RESTLI_METHODS.BATCH_FINDER,
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
    resource,
    actionName,
    data = null,
    queryParams = {},
    versionString = null,
    accessToken,
    additionalConfig
  }: LIActionRequestOptions): Promise<LIActionResponse> {
    const baseUrl = getRestApiBaseUrl(versionString);
    const encodedQueryParamString = paramEncode({
      action: actionName,
      ...queryParams
    });
    const requestConfig = _.merge({
      method: 'POST',
      url: `${baseUrl}${resource}?${encodedQueryParamString}`,
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
