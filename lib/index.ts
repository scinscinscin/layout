import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import type React from "react";

type KIfTIsNotEmpty<T, K> = {} extends T ? {} : K;
type WithChildren<T> = T & { children: React.ReactNode };

interface CachingOptions {
  hash: (ctx: GetServerSidePropsContext) => string;
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
& ({ deserialize: (original: any) => any; serialize: (serialized: any) => any } | {});

export function GenerateLayout<Obj extends GenerateLayoutOptionsInterface>(
  generateLayoutOptions: GenerateLayoutOptions<Obj>
) {
  type ServerSideLayoutProps = Obj["ServerSideLayoutProps"];
  type ExportedInternalProps = Obj["ExportedInternalProps"];
  type ClientSideLayoutProps = Obj["ClientSideLayoutProps"];
  type ServerSidePropsContext = Obj["ServerSidePropsContext"];
  type LayoutGSSPOptions = Obj["LayoutGSSPOptions"];

  function generateGetServerSideProps<Props>(
    passthrough: {} extends ServerSideLayoutProps
      ? (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<Props>>
      : (ctx: GetServerSidePropsContext, locals: ServerSidePropsContext) => Promise<GetServerSidePropsResult<Props>>,
    options: { caching?: CachingOptions; layoutGsspOptions?: LayoutGSSPOptions }
  ): (
    context: GetServerSidePropsContext
  ) => Promise<GetServerSidePropsResult<{ serverSideProps: Props; internalProps: ServerSideLayoutProps }>> {
    const localCache = new Map<string, GetServerSidePropsResult<Props>>();

    return async function (context) {
      try {
        // calculate server side layout props
        const layoutServerSideResult: LayoutGetServerSideProps<Obj> =
          "getServerSideProps" in generateLayoutOptions
            ? await generateLayoutOptions.getServerSideProps(context, options.layoutGsspOptions)
            : { props: {} };

        if ("props" in layoutServerSideResult) {
          const layoutGetServerSideProps = await layoutServerSideResult.props;
          let passthroughResults: GetServerSidePropsResult<Props>;

          if (options.caching != undefined) {
            const cachingKey = options.caching.hash(context);

            if (!localCache.has(cachingKey)) {
              passthroughResults = await passthrough(context, layoutGetServerSideProps.locals ?? {});
              localCache.set(cachingKey, passthroughResults);
              setTimeout(() => localCache.delete(cachingKey), options.caching.timeoutInMs);
            } else {
              passthroughResults = localCache.get(cachingKey)!;
            }
          } else {
            passthroughResults = await passthrough(context, layoutGetServerSideProps.locals ?? {});
          }

          if ("props" in passthroughResults) {
            const serverSideProps = await passthroughResults.props;
            const props = { serverSideProps, internalProps: layoutGetServerSideProps.layout ?? {} };
            return { props: "serialize" in generateLayoutOptions ? generateLayoutOptions.serialize(props) : props };
          } else {
            // Something wrong happened inside the passthrough function so return its output
            return passthroughResults;
          }
        } else {
          // Something wrong happened inside the generateInternalProps function, so return its output
          return layoutServerSideResult;
        }
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
      getServerSideProps: {} extends ServerSidePropsContext
        ? (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<ServerSideProps>>
        : (
            ctx: GetServerSidePropsContext,
            locals: ServerSidePropsContext
          ) => Promise<GetServerSidePropsResult<ServerSideProps>>;

      cacheServerSideProps?: CachingOptions;
    }
  > &
    KIfTIsNotEmpty<LayoutGSSPOptions, { layoutGsspOptions: LayoutGSSPOptions }>;

  function createPage<ServerSideProps>(createPageOptions: CreatePageOptions<ServerSideProps>) {
    function defaultExport(_props: { serverSideProps: ServerSideProps; internalProps: ServerSideLayoutProps }) {
      const props: typeof _props =
        "deserialize" in generateLayoutOptions ? generateLayoutOptions.deserialize(_props) : _props;

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
