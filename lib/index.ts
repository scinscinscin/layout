import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import type React from "react";
import { Cache, LRU } from "./lru";
import crypto from "node:crypto";

type KIfTIsNotEmpty<T, K> = {} extends T ? {} : K;
type WithChildren<T> = T & { children: React.ReactNode };

interface CachingOptions<ServerSidePropsContext> {
  hash: {} extends ServerSidePropsContext
    ? (ctx: GetServerSidePropsContext) => string
    : (ctx: GetServerSidePropsContext, locals: ServerSidePropsContext) => string;
  timeoutInMs: number;
}

type GenerateLayoutOptionsInterface = {
  /** Data sent to layout FROM server */
  ServerSideLayoutProps: { [key: string]: any };
  /** Data sent to layout FROM client */
  ClientSideLayoutProps: { [key: string]: any };
  /** Data sent FROM layout to the page */
  ExportedInternalProps: { [key: string]: any };
  /** Data sent to the page's getServerSideProps function */
  ServerSidePropsContext: { [key: string]: any };
  /** Data sent to the layout's getServerSideProps function */
  LayoutGSSPOptions: { [key: string]: any };
};

export type GenerateLayoutOptionsImpl = {
  ServerSideLayoutProps: {};
  ClientSideLayoutProps: {};
  ExportedInternalProps: {};
  ServerSidePropsContext: {};
  LayoutGSSPOptions: {};
};

type LayoutGetServerSideProps<Obj extends GenerateLayoutOptionsInterface> = GetServerSidePropsResult<
  KIfTIsNotEmpty<Obj["ServerSideLayoutProps"], { layout: Obj["ServerSideLayoutProps"] }> &
    KIfTIsNotEmpty<Obj["ServerSidePropsContext"], { locals: Obj["ServerSidePropsContext"] }>
>;

// prettier-ignore
type GenerateLayoutOptions<Obj extends GenerateLayoutOptionsInterface> = {
  exceptionHandler?: (err: any) => Promise<GetServerSidePropsResult<any>>;
  generateCache?: <K, V>(pageUuid: string) => Cache<K, V>;
  serializer?: { serialize: (original: any) => any, deserialize: (serialized: any) => any }
  layoutComponent: (props: {internalProps: Obj["ServerSideLayoutProps"]; layoutProps: WithChildren<Obj["ClientSideLayoutProps"]>}) => React.ReactNode;
}
& KIfTIsNotEmpty<Obj["ServerSideLayoutProps"] & Obj["ServerSidePropsContext"],
  { getServerSideProps: 
    {} extends Obj["LayoutGSSPOptions"] ? 
    (ctx: GetServerSidePropsContext) => Promise<LayoutGetServerSideProps<Obj>> :
    (ctx: GetServerSidePropsContext, config: Obj["LayoutGSSPOptions"]) => Promise<LayoutGetServerSideProps<Obj>>
    ; }
>
& KIfTIsNotEmpty<Obj["ServerSideLayoutProps"], KIfTIsNotEmpty<Obj["ExportedInternalProps"],
	{ generateExportedInternalProps: (internalProps: Obj["ServerSideLayoutProps"]) => Obj["ExportedInternalProps"] }
>>

export function GenerateLayout<Obj extends GenerateLayoutOptionsInterface>(
  generateLayoutOptions: GenerateLayoutOptions<Obj>
) {
  type ServerSideLayoutProps = Obj["ServerSideLayoutProps"];
  type ExportedInternalProps = Obj["ExportedInternalProps"];
  type ClientSideLayoutProps = Obj["ClientSideLayoutProps"];
  type ServerSidePropsContext = Obj["ServerSidePropsContext"];
  type LayoutGSSPOptions = Obj["LayoutGSSPOptions"];

  const cacheGenerator = generateLayoutOptions.generateCache || (() => new LRU(100));

  function generateGetServerSideProps<Props>(
    passthrough: {} extends ServerSideLayoutProps
      ? (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<Props>>
      : (ctx: GetServerSidePropsContext, locals: ServerSidePropsContext) => Promise<GetServerSidePropsResult<Props>>,
    options: { caching?: CachingOptions<ServerSidePropsContext>; layoutGsspOptions?: LayoutGSSPOptions }
  ): (
    context: GetServerSidePropsContext
  ) => Promise<GetServerSidePropsResult<{ serverSideProps: Props; internalProps: ServerSideLayoutProps }>> {
    const localCache = cacheGenerator(crypto.randomUUID()) as Cache<string, GetServerSidePropsResult<Props>>;

    // The function exported under `getServerSideProps` by the page
    return async function (context) {
      try {
        // calculate server side layout props
        const layoutServerSideResult: LayoutGetServerSideProps<Obj> =
          "getServerSideProps" in generateLayoutOptions
            ? await generateLayoutOptions.getServerSideProps(context, options.layoutGsspOptions)
            : { props: {} };

        // Something wrong happened inside the generateInternalProps function, so return its output
        if (!("props" in layoutServerSideResult)) return layoutServerSideResult;
        const layoutGetServerSideProps = await layoutServerSideResult.props;

        // Fetch the results of the passthrough function
        const locals = layoutGetServerSideProps.locals ?? {};
        let passthroughResults: GetServerSidePropsResult<Props> | undefined = undefined;

        // If the page has caching options enabled then try to fetch from the cache
        if (options.caching != undefined) {
          // Generate the caching key for the request from its context and fetch data
          // if there was an error with the cache, then default to undefined
          const cachingKey = options.caching.hash(context, locals);
          const cacheHit = await localCache.get(cachingKey).catch(() => undefined);

          // If cache did not have the data, fetch data from passthrough and cache it
          if (cacheHit === undefined) {
            passthroughResults = await passthrough(context, locals);
            localCache.set(cachingKey, passthroughResults, { timeoutInMs: options.caching.timeoutInMs }).catch();
          } else passthroughResults = cacheHit;
        }

        // Make absolutely sure that passthroughResults is not undefined
        if (passthroughResults === undefined) passthroughResults = await passthrough(context, locals);

        // Something wrong happened inside the passthrough function so return its output
        if (!("props" in passthroughResults)) return passthroughResults;

        // Combine serverSideProps and internalProps, serialize it, and return it to the client
        const serverSideProps = await passthroughResults.props;
        const props = { serverSideProps, internalProps: layoutGetServerSideProps.layout ?? {} };
        return {
          props:
            typeof generateLayoutOptions.serializer !== "undefined"
              ? generateLayoutOptions.serializer.serialize(props)
              : props,
        };
      } catch (err) {
        if (generateLayoutOptions.exceptionHandler) return await generateLayoutOptions.exceptionHandler(err);
        else throw err;
      }
    };
  }

  type CreatePageOptions<ServerSideProps> = {
    page: (props: ServerSideProps & ExportedInternalProps) => WithChildren<ClientSideLayoutProps>;
  } & KIfTIsNotEmpty<
    ServerSideProps,
    {
      // prettier-ignore
      getServerSideProps: {} extends ServerSidePropsContext
        ? (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<ServerSideProps>>
        : (ctx: GetServerSidePropsContext, locals: ServerSidePropsContext) => Promise<GetServerSidePropsResult<ServerSideProps>>;
      cacheServerSideProps?: CachingOptions<ServerSidePropsContext>;
    }
  > &
    KIfTIsNotEmpty<LayoutGSSPOptions, { layoutGsspOptions: LayoutGSSPOptions }>;

  function createPage<ServerSideProps>(createPageOptions: CreatePageOptions<ServerSideProps>) {
    function defaultExport(_props: { serverSideProps: ServerSideProps; internalProps: ServerSideLayoutProps }) {
      const props: typeof _props =
        typeof generateLayoutOptions.serializer !== "undefined"
          ? generateLayoutOptions.serializer.deserialize(_props)
          : _props;

      const exportedInternalProps =
        "generateExportedInternalProps" in generateLayoutOptions
          ? generateLayoutOptions.generateExportedInternalProps(props.internalProps)
          : ({} as ExportedInternalProps);

      const layoutProps = createPageOptions.page({ ...props.serverSideProps, ...exportedInternalProps });
      return generateLayoutOptions.layoutComponent({ internalProps: props.internalProps, layoutProps });
    }

    const layoutGsspOptions = "layoutGsspOptions" in createPageOptions ? createPageOptions.layoutGsspOptions : {};
    const getServerSideProps =
      "getServerSideProps" in createPageOptions
        ? generateGetServerSideProps(createPageOptions.getServerSideProps, {
            caching: createPageOptions.cacheServerSideProps,
            layoutGsspOptions,
          })
        : generateGetServerSideProps(async () => ({ props: {} }), { layoutGsspOptions });

    return { defaultExport, getServerSideProps };
  }

  return { createPage };
}
