### @scinorandex/layout

Create typesafe layouts with Next.js Pages router.

--- 

### Use case

Your layout component needs data from the server (such as the currently logged in user) and you don't want to request it on the client side when the page loads. You must fetch the data with getServerSideProps and pass it to the layout.

This package makes it easy to send data between the client and server, and from getServerSideProps and the page function.

### Getting Started

**To get started, install the package in your Next.js Pages router project:**
```bash
yarn add @scinorandex/layout # or 'npm install @scinorandex/layout'
```

**Create a new file for your layout and import the ff:**
```ts
import { GenerateLayout, DefaultLayoutOptions } from "@scinorandex/layout";
```

**Define the types of data to be transferred between the different parts of the layout:**
```ts
interface PrivateLayoutOpts extends DefaultLayoutOptions {
  ServerSideLayoutProps: { user: UserT };
  ClientSideLayoutProps: { title: string };
  ExportedInternalProps: { user: UserT };
  ServerSidePropsContext: { user: User; db: PrismaClient };
  LayoutGSSPOptions: { permisisonRequired: "admin" | "superadmin" };
}
```

**What each property means and where it's used:**

 - `ServerSideLayoutProps` - data that the layout component needs from the server
   - The layout component shows the user's profile, so we need the user DTO from the server.
 - `ClientSideLayoutProps` - data that the layout component needs from the page component
   - The layout component needs the title of the page (passed into `next-seo`) 
 - `ExportedInternalProps` - data that the layout component passes into the page component
   - The layout component passes the user DTO it got from the server into the page componen
 - `ServerSidePropsContext` - data that's passed from the layout's gSSP function and into the page's gSSP
   - Some page's gSSP might need the user object, which the layout's gSSP already calculated. This allows the reuse objects between the layout and page gSSPs. 
 - `LayoutGSSPOptions` - Options that are passed from the page and into
   - This allows you to pass parameters into the layout's gSSP. In this case, you can set the minimum required authorization for the user to access the page. 

All of the properties are optional, default types are provided by `DefaultLayoutOptions`

**Data flow visualization:**
![Data flow using the library](./assets/image.png)

**Now it's time to implement the necessary functions:**

```tsx
export const PrivateLayout = GenerateLayout<PrivateLayoutOpts>({
  // You're asked to implement this method if ExportedInternalProps has properties defined
  // This method determines the exported internal props from the layout's gSSP method
  generateExportedInternalProps(internalProps){ 
    return { user: internalProps.user } 
  },

  // This is the React component that wraps around your page
  // layoutProps is ClientSideLayoutProps & { children: React.ReactNode } and comes from the page
  // internalProps is ServerSideLayoutProps and comes from the layout's gSSP method 
  layoutComponent({ layoutProps, internalProps }) {
    return (
      <div className={styles.root}>
        <NextSeo title={layoutProps.title} openGraph={{ title: layoutProps.title }} />
        
        <header className={styles.header}>
          <div className={styles.inner}>
            <h1>Petbook</h1>
            <p>{internalProps.user.username}</p>
          </div>
        </header>

        <main className={styles.main}>{layoutProps.children}</main>
      </div>
    );
  },

  // You're asked to implement getServerSideProps if ServerSideLayoutProps has properties defined
  // Here, you can fetch data for the layout, and even do middleware-like auth checking
  // ctx is the Next.js GetServerSidePropsContext object
  // options is the LayoutGSSPOptions object from the page
  async getServerSideProps(ctx, options) {
    const user = await getUser(ctx);

    // if the user isn't logged in, then redirect back to login page
    if (!user) return { redirect: { destination: "/login", permanent: false } };
    
    // if the user doesn't have necessary permissions, redirect to a forbidden page
    if (options.permissionRequired === "superadmin" && user.accountType === "admin")
      return { redirect: { destination: "/forbidden", permanent: false } };

    return { 
      props: {
        // This is the data sent to the layout component, and is typed as ServerSideLayoutProps
        layout: { user: Cleanse.user(user) },
        // This is the data sent to the page's getServerSideProps handelr, and is typed as ServerSidePropsContext 
        locals: { user, db } 
      } 
    };
  },
});
```

**Use the layout:**

Now that the layout is defined, we can finally use it in a page.

```tsx
// The createPage method accepts a type parameter that dictates the server side props required by the page  
const Page = PrivateLayout.createPage<{ petNames: string[] }>({
  layoutGsspOptions: { permisisonRequired: "admin" },

  // You're asked to implement the page's getServerSideProps method if createPage's type parameter has properties defined
  // ctx - the Next.js GetServerSidePropsContext object
  // locals - the locals object passed from the layout's getServerSideProps output
  async getServerSideProps(ctx, locals) {
    const pets = await db.pets.findMany({ where: { ownerUuid: locals.user.uuid } })
    return { props: { petNames: pets.map(pet => pet.name) } }
  },

  // This is the page-specific frontend code. 
  // Its return type is ClientSideLayoutProps & { children: React.ReactNode }
  // Props is a merging of the result of getServerSideProps and ExportedInternalProps
  // In this case its type is { petNames: string[], user: UserT }
  page(props) {
    return {
      title: "List of Pets",
      children: <div>
        <ul>
          {props.petNames.map(petName => ( <li>{petName}</li> ))}
        </ul>
      </div>
    };
  },
});

export default Page.defaultExport;
export const getServerSideProps = Page.getServerSideProps;
```