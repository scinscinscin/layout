import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import type React from "react";

type KIfTIsNotEmpty<T, K> = {} extends T ? {} : K;
type WithChildren<T> = T & { children: React.ReactNode };

interface CachingOptions {
  hash: (ctx: GetServerSidePropsContext) => string;
  timeoutInMs: number;
}

export type GenerateLayoutOptionsInterface = {
  InternalProps: { [key: string]: any };
  LayoutProps: { [key: string]: any };
  ExportedInternalProps: { [key: string]: any };
};

type GenerateLayoutOptions<Obj extends GenerateLayoutOptionsInterface> = {
  exceptionHandler?: (err: any) => Promise<GetServerSidePropsResult<any>>;
  layoutComponent: (props: {
    internalProps: Obj["InternalProps"];
    layoutProps: WithChildren<Obj["LayoutProps"]>;
  }) => React.ReactNode;
} & KIfTIsNotEmpty<
  Obj["InternalProps"],
  { generateInternalProps: (ctx: GetServerSidePropsContext) => Promise<Obj["InternalProps"]> } & KIfTIsNotEmpty<
    Obj["ExportedInternalProps"],
    { generateExportedInternalProps: (internalProps: Obj["InternalProps"]) => Obj["ExportedInternalProps"] }
  >
> &
  (
    | {
        deserialize: (original: any) => any;
        serialize: (serialized: any) => any;
      }
    | {}
  );

export function GenerateLayout<Obj extends GenerateLayoutOptionsInterface>(
  generateLayoutOptions: GenerateLayoutOptions<Obj>
) {
  type InternalProps = Obj["InternalProps"];
  type ExportedInternalProps = Obj["ExportedInternalProps"];
  type LayoutProps = Obj["LayoutProps"];

  function generateGetServerSideProps<Props>(
    passthrough: (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<Props>>,
    options: { caching?: CachingOptions }
  ) {
    const localCache = new Map<string, GetServerSidePropsResult<Props>>();

    return async function (
      context: GetServerSidePropsContext
    ): Promise<GetServerSidePropsResult<{ serverSideProps: Props; internalProps: InternalProps }>> {
      try {
        let passthroughResults: GetServerSidePropsResult<Props>;

        if (options.caching != undefined) {
          const cachingKey = options.caching.hash(context);

          if (!localCache.has(cachingKey)) {
            passthroughResults = await passthrough(context);
            localCache.set(cachingKey, passthroughResults);
            setTimeout(() => localCache.delete(cachingKey), options.caching.timeoutInMs);
          } else {
            passthroughResults = localCache.get(cachingKey)!;
          }
        } else {
          passthroughResults = await passthrough(context);
        }

        if ("props" in passthroughResults) {
          const serverSideProps = await passthroughResults.props;
          const internalProps =
            "generateInternalProps" in generateLayoutOptions
              ? await generateLayoutOptions.generateInternalProps(context)
              : ({} as InternalProps);

          const props = { serverSideProps, internalProps };
          return { props: "serialize" in generateLayoutOptions ? generateLayoutOptions.serialize(props) : props };
        } else {
          // Something wrong happened inside the passthrough function so return its output
          return passthroughResults;
        }
      } catch (err) {
        if (generateLayoutOptions.exceptionHandler) return await generateLayoutOptions.exceptionHandler(err);
        else throw err;
      }
    };
  }

  type CreatePageOptions<ServerSideProps> = {
    page: (props: ServerSideProps & ExportedInternalProps) => WithChildren<LayoutProps>;
  } & KIfTIsNotEmpty<
    ServerSideProps,
    {
      getServerSideProps: (ctx: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<ServerSideProps>>;
      cacheServerSideProps?: CachingOptions;
    }
  >;

  function createPage<ServerSideProps>(createPageOptions: CreatePageOptions<ServerSideProps>) {
    function defaultExport(_props: { serverSideProps: ServerSideProps; internalProps: InternalProps }) {
      const props: typeof _props =
        "deserialize" in generateLayoutOptions ? generateLayoutOptions.deserialize(_props) : _props;

      const exportedInternalProps =
        "generateExportedInternalProps" in generateLayoutOptions
          ? generateLayoutOptions.generateExportedInternalProps(props.internalProps)
          : ({} as ExportedInternalProps);

      const layoutProps = createPageOptions.page({ ...props.serverSideProps, ...exportedInternalProps });
      return generateLayoutOptions.layoutComponent({ internalProps: props.internalProps, layoutProps });
    }

    const getServerSideProps =
      "getServerSideProps" in createPageOptions
        ? generateGetServerSideProps(createPageOptions.getServerSideProps, {
            caching: createPageOptions.cacheServerSideProps,
          })
        : generateGetServerSideProps(async () => ({ props: {} }), {});

    return { defaultExport, getServerSideProps };
  }

  return { createPage };
}
