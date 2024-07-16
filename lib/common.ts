export type GenerateLayoutOptionsInterface = {
  /** Data sent to layout FROM server */
  ServerSideLayoutProps: { [key: string]: any };
  /** Data sent to layout FROM client */
  ClientSideLayoutProps: { [key: string]: any };
  /** Data sent FROM layout to the page */
  ExportedInternalProps: { [key: string]: any };
  /** Data sent to the page's getServerSideProps function */
  ServerSidePropsContext: { [key: string]: any };
  /** Data sent to the layout's getServerSideProps function */
  ServerLayoutOptions: { [key: string]: any };
  Transform: { [key: string]: any };
};

export type GenerateLayoutOptionsImpl = {
  ServerSideLayoutProps: {};
  ClientSideLayoutProps: {};
  ExportedInternalProps: {};
  ServerSidePropsContext: {};
  ServerLayoutOptions: {};
  Transform: {};
};
