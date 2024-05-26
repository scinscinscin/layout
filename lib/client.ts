import { GenerateLayoutOptionsInterface } from "./common";
import { KIfTIsNotEmpty } from "./utils";
type WithChildren<T> = T & { children: React.ReactNode };

type ImplementLayoutFrontendOptions<Obj extends GenerateLayoutOptionsInterface> = {
  deserialize?: (serialized: any) => any;
  layoutComponent: (props: {
    internalProps: Obj["ServerSideLayoutProps"];
    layoutProps: WithChildren<Obj["ClientSideLayoutProps"]>;
  }) => React.ReactNode;
} & KIfTIsNotEmpty<
  Obj["ServerSideLayoutProps"],
  KIfTIsNotEmpty<
    Obj["ExportedInternalProps"],
    { generateExportedInternalProps: (internalProps: Obj["ServerSideLayoutProps"]) => Obj["ExportedInternalProps"] }
  >
>;

export function implementLayoutFrontend<Obj extends GenerateLayoutOptionsInterface>(
  options: ImplementLayoutFrontendOptions<Obj>
) {
  type ServerSideLayoutProps = Obj["ServerSideLayoutProps"];
  type ExportedInternalProps = Obj["ExportedInternalProps"];
  type ClientSideLayoutProps = Obj["ClientSideLayoutProps"];

  type CreatePageOptions<ServerSideProps> = (
    props: ServerSideProps & ExportedInternalProps
  ) => WithChildren<ClientSideLayoutProps>;

  function use<ServerSideProps>(createPageOptions: CreatePageOptions<ServerSideProps>) {
    function defaultExport(_props: { serverSideProps: ServerSideProps; internalProps: ServerSideLayoutProps }) {
      const props: typeof _props = typeof options.deserialize !== "undefined" ? options.deserialize(_props) : _props;

      const exportedInternalProps =
        "generateExportedInternalProps" in options
          ? options.generateExportedInternalProps(props.internalProps)
          : ({} as ExportedInternalProps);

      const layoutProps = createPageOptions({ ...props.serverSideProps, ...exportedInternalProps });
      return options.layoutComponent({ internalProps: props.internalProps, layoutProps });
    }

    return defaultExport;
  }

  return { use };
}
