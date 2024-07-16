import { GenerateLayoutOptionsInterface } from "./common";
import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { Cache, LRU } from "./lru";
import { generateId } from "./generateId";
import { KIfTIsNotEmpty } from "./utils";
import { ParsedUrlQuery } from "querystring";
import { NextParameters } from "./utils";

type LayoutGetServerSideProps<Obj extends GenerateLayoutOptionsInterface> = GetServerSidePropsResult<
  KIfTIsNotEmpty<Obj["ServerSideLayoutProps"], { layout: Obj["ServerSideLayoutProps"] }> &
    KIfTIsNotEmpty<Obj["ServerSidePropsContext"], { locals: Obj["ServerSidePropsContext"] }>
>;

interface CachingOptions<ServerSidePropsContext> {
  hash: {} extends ServerSidePropsContext
    ? (ctx: GetServerSidePropsContext) => string
    : (ctx: GetServerSidePropsContext, locals: ServerSidePropsContext) => string;
  timeoutInMs: number;
}

// prettier-ignore
type ImplementLayoutBackendOptions<Obj extends GenerateLayoutOptionsInterface> = {
  exceptionHandler?: (err: any) => Promise<GetServerSidePropsResult<any>>;
  generateCache?: <K, V>(pageUuid: string) => Cache<K, V>;
  serialize?: (original: any) => any
}
& KIfTIsNotEmpty<Obj["ServerSideLayoutProps"] & Obj["ServerSidePropsContext"],
  { getServerSideProps: 
    {} extends Obj["ServerLayoutOptions"] ? 
    (ctx: GetServerSidePropsContext) => Promise<LayoutGetServerSideProps<Obj>> :
    (ctx: GetServerSidePropsContext, config: Obj["ServerLayoutOptions"]) => Promise<LayoutGetServerSideProps<Obj>>
    ; }
>
& KIfTIsNotEmpty<Obj["Transform"], { executeTransform: (
  ctx: GetServerSidePropsContext,
  pageProps: {serverSideProps: any, internalProps: Obj["ServerSideLayoutProps"]}
) => Promise<Obj["Transform"]> }>

export function implementLayoutBackend<Obj extends GenerateLayoutOptionsInterface>(
  generateLayoutOptions: ImplementLayoutBackendOptions<Obj>
) {
  type ServerSideLayoutProps = Obj["ServerSideLayoutProps"];
  type ServerSidePropsContext = Obj["ServerSidePropsContext"];
  type ServerLayoutOptions = Obj["ServerLayoutOptions"];

  const cacheGenerator = generateLayoutOptions.generateCache || (() => new LRU(100));

  function generateGetServerSideProps<Props, Params extends ParsedUrlQuery>(
    passthrough: {} extends ServerSideLayoutProps
      ? (ctx: GetServerSidePropsContext<Params>) => Promise<GetServerSidePropsResult<Props>>
      : (
          ctx: GetServerSidePropsContext<Params>,
          locals: ServerSidePropsContext
        ) => Promise<GetServerSidePropsResult<Props>>,
    options: { caching?: CachingOptions<ServerSidePropsContext>; serverLayoutOptions?: ServerLayoutOptions }
  ): (
    context: GetServerSidePropsContext<Params>
  ) => Promise<GetServerSidePropsResult<{ serverSideProps: Props; internalProps: ServerSideLayoutProps }>> {
    const localCache = cacheGenerator(generateId(12)) as Cache<string, GetServerSidePropsResult<Props>>;

    // The function exported under `getServerSideProps` by the page
    return async function (context) {
      try {
        // calculate server side layout props
        const layoutServerSideResult: LayoutGetServerSideProps<Obj> =
          "getServerSideProps" in generateLayoutOptions
            ? await generateLayoutOptions.getServerSideProps(context, options.serverLayoutOptions)
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
        const props = { serverSideProps, internalProps: layoutGetServerSideProps.layout ?? {}, transform: {} };

        if ("executeTransform" in generateLayoutOptions)
          props["transform"] = await generateLayoutOptions.executeTransform(context, props);

        return {
          props:
            typeof generateLayoutOptions.serialize !== "undefined" ? generateLayoutOptions.serialize(props) : props,
        };
      } catch (err) {
        if (generateLayoutOptions.exceptionHandler) return await generateLayoutOptions.exceptionHandler(err);
        else throw err;
      }
    };
  }

  type CreatePageOptions<ServerSideProps, Params extends ParsedUrlQuery> = KIfTIsNotEmpty<
    ServerSideProps,
    {
      // prettier-ignore
      getServerSideProps: {} extends ServerSidePropsContext
        ? (ctx: GetServerSidePropsContext<Params>) => Promise<GetServerSidePropsResult<ServerSideProps>>
        : (ctx: GetServerSidePropsContext<Params>, locals: ServerSidePropsContext) => Promise<GetServerSidePropsResult<ServerSideProps>>;
      cacheServerSideProps?: CachingOptions<ServerSidePropsContext>;
    }
  > &
    KIfTIsNotEmpty<ServerLayoutOptions, { serverLayoutOptions: ServerLayoutOptions }>;

  function use<ServerSideProps, Route extends string = "">(
    options: CreatePageOptions<ServerSideProps, NextParameters<Route>>
  ) {
    const serverLayoutOptions = "serverLayoutOptions" in options ? options.serverLayoutOptions : {};
    const getServerSideProps =
      "getServerSideProps" in options
        ? generateGetServerSideProps<ServerSideProps, NextParameters<Route>>(options.getServerSideProps, {
            caching: options.cacheServerSideProps,
            serverLayoutOptions,
          })
        : // @ts-ignore
          generateGetServerSideProps<ServerSideProps, NextParameters<Route>>(async () => ({ props: {} }), {
            serverLayoutOptions,
          });

    return getServerSideProps;
  }

  return { use };
}
