import { GetStaticProps, GetStaticPropsContext, GetStaticPropsResult } from "next";
import { GenerateLayoutOptionsInterface } from "./common";
import { KIfTIsNotEmpty } from "./utils";
import { ParsedUrlQuery } from "querystring";
import { NextParameters } from "./utils";

type LayoutGetStaticProps<Obj extends GenerateLayoutOptionsInterface> = GetStaticPropsResult<
  KIfTIsNotEmpty<Obj["ServerSideLayoutProps"], { layout: Obj["ServerSideLayoutProps"] }> &
    KIfTIsNotEmpty<Obj["ServerSidePropsContext"], { locals: Obj["ServerSidePropsContext"] }>
>;

type ImplementLayoutStaticOptions<Obj extends GenerateLayoutOptionsInterface> = {
  serialize?: (original: any) => any;
} & KIfTIsNotEmpty<
  Obj["ServerSideLayoutProps"] & Obj["ServerSidePropsContext"],
  {
    getStaticProps: {} extends Obj["ServerLayoutOptions"]
      ? (ctx: GetStaticPropsContext) => Promise<LayoutGetStaticProps<Obj>>
      : (ctx: GetStaticPropsContext, config: Obj["ServerLayoutOptions"]) => Promise<LayoutGetStaticProps<Obj>>;
  }
>;

export function implementLayoutStatic<Obj extends GenerateLayoutOptionsInterface>(
  layoutOptions: ImplementLayoutStaticOptions<Obj>
) {
  type ServerLayoutOptions = Obj["ServerLayoutOptions"];

  type Opts<Props, Params extends ParsedUrlQuery> = ({} extends Props
    ? {}
    : {
        // prettier-ignore
        getStaticProps: {} extends Obj["ServerSidePropsContext"]
          ? (ctx: GetStaticPropsContext<Params>) => Promise<GetStaticPropsResult<Props>>
          : (ctx: GetStaticPropsContext<Params>, locals: Obj["ServerSidePropsContext"]) => Promise<GetStaticPropsResult<Props>>;
      }) &
    KIfTIsNotEmpty<ServerLayoutOptions, { serverLayoutOptions: ServerLayoutOptions }>;

  function use<Props, Route extends string = "">(
    opts: Opts<Props, NextParameters<Route>>
  ): GetStaticProps<{ serverSideProps: Props; internalProps: Obj["ServerSideLayoutProps"] }, NextParameters<Route>> {
    // The function exported under getStaticProps
    return async function (context: GetStaticPropsContext<NextParameters<Route>>) {
      const serverLayoutOptions = "serverLayoutOptions" in opts ? opts.serverLayoutOptions : {};

      const results: LayoutGetStaticProps<Obj> = layoutOptions.getStaticProps
        ? await layoutOptions.getStaticProps(context, serverLayoutOptions)
        : { props: { layout: {}, locals: {} } };

      if ("props" in results === false) return results;
      const { layout, locals } = results.props;

      const inner: GetStaticPropsResult<Props> =
        "getStaticProps" in opts ? await opts.getStaticProps(context, locals) : { props: {} as Props };
      if ("props" in inner === false)
        return "revalidate" in results ? { ...inner, revalidate: inner.revalidate ?? results.revalidate } : inner;

      const _props = { serverSideProps: inner.props, internalProps: layout };
      const props = layoutOptions.serialize ? layoutOptions.serialize(_props) : _props;
      return { props, revalidate: results.revalidate ?? inner.revalidate };
    };
  }

  return { use };
}
