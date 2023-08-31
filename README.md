# @scinorandex/layout

**Because creating typesafe layouts in Next.js should be easier.**

A layout is an interface that is common to all pages, such as a header and footer. Sometimes, data needs to be fetched server side to populate these layouts. 
![](./assets/image.png "Data flow")

**The diagram shows the typical flow of data between in a website.**

 - **Internal props** - the server side data that the layout needs
   - this could be the profile of the currently logged in user
   - the header of the website might contain a list of sections fetched from the database
 - **Page props** - the server side data that the page needs
 - **Layout props** - Props from the frontend that tell the layout how to behave
   - Some pages might require you to disable the footer / header based on state
 - **Exported Internal Props** - A subset of internal props that is provided to all pages that use that layout
   - Pages might require the same data that is already fetched by the layout's backend, which can be reused to prevent code duplication

We need a way to reconcile all the different paths that data will travel, something that Next.js doesn't provide out of the box. This is the problem that `@scinorandex/layout` solves.

# Usage

The package works by effortlessly wrapping pages and `getServerSideProps` in layouts.

## Creating layouts

Once the package has been installed, you can create a layout using the `GenerateLayout()` function. This function takes one type parameter and one function parameter.

```tsx
import { User } from "@prisma/client";
import { GenerateLayout } from "@scinorandex/layout";
import { authenticate } from "../utils/auth";

export const PublicLayout = GenerateLayout<{
  // The data that the layout needs to fetch server side
  InternalProps: { user: User, currentTime: string };
  // The data that the layout wants to provide to all pages that use it
  ExportedInternalProps: { user: User };
  // The properties that allows pages to control the layout's appearance
  LayoutProps: { showHeader: boolean };
}>({
  // You don't need to define this function if your InternalProps is empty ({})
  async generateInternalProps(ctx) {
    const currentlyLoggedInUser = authenticate(ctx);
    const serverTime = (new Date()).toISOString();
    
    return { user, serverTime };
  },

  // You don't need to define this function if your ExportedInternalProps is empty ({})
  generateExportedInternalProps(internalProps) {
    return { user: internalProps.user };
  },

  // layoutProps comes from the page that uses the layout
  layoutComponent: ({ internalProps, layoutProps }) => {
    return (
      <div>
        {layoutProps.showHeader && (
          <header>
            <h1>The current time is: {internalProps.serverTime}</h1>
            <h1>The currently logged in user is: {internalProps.user.username}</h1>
          </header>
        )}

        <main>
          {layoutProps.children}
        </main>
        
        <footer>Copyright 2023</footer>
      </div>
    );
  },
});
```

## Using the layout

Created layouts have a `createPage()` method that takes in one type parameter that specifies the server-side data for the page, and one function parameter.

```tsx
import { PublicLayout } from "../layout/public";
import ReactMarkdown from "react-markdown";

const Page = PublicLayout.createPage<{ markdown: string }>({
  // You don't need to define this function if the type parameter you pass is empty ({})
  async getServerSideProps(ctx) {
    const uuid = ctx.params.uuid as string;
    const markdown = await fetchPostFromDatabase(uuid);
    return { markdown };
  },

  // We can (optionally) cache the page props for improved performance 
  cacheServerSideProps: {
    // Generate a unique hash for the requested page (like a post uuid)
    hash: (ctx) => ctx.params.uuid as string,
    // Cache data in 10 minute intervals
    timeoutInMs: 10 * 60 * 1000,
  },

  // The props this function receives is the combination of the
  // page props and exported internal props
  page: ({ markdown, user }) => {
    return {
      showHeader: true,
      children: <>
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </>,
    };
  },
});

// Export the wrapped pages and getServerSideProps for next.js to use
export default Page.defaultExport;
export const getServerSideProps = Page.getServerSideProps;
```
