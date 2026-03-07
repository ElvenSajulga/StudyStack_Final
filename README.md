## StudyStack_WP

StudyStack_WP is an Angular web application for managing school-related workflows for **admins**, **teachers**, and **students** – including dashboards, announcements, activities, attendance, grades, and profile/settings pages.

### Purpose of the system

- **Admins**: Manage teacher and student accounts, monitor overall school data, and oversee announcements and activities.
- **Teachers**: Record and track student attendance, grades, class activities, and post announcements to their sections.
- **Students**: View grades, attendance, activities, and announcements, and manage their own profile and settings.

Overall, the system aims to **centralize classroom information** and **improve communication** between admins, teachers, and students in a single, easy-to-use web platform.

### Tech stack

- **Framework**: Angular 21
- **Runtime**: Node.js (npm)
- **Styling**: SCSS
- **Testing**: Vitest
- **Mock API**: `json-server` backed by `db.json`

### Prerequisites

- **Node.js** (LTS recommended)
- **npm** (comes with Node.js)

### Installation

Install dependencies after cloning the repository:

```bash
npm install
```

### Running the app (frontend)

Start the Angular development server:

```bash
npm start
```

Then open your browser at `http://localhost:4200/`. The app will automatically reload when you change source files.

If you prefer the Angular CLI command directly, you can also run:

```bash
ng serve
```

### Running the mock API (json-server)

This project uses `json-server` with `db.json` to simulate a backend API.

In a separate terminal, run:

```bash
npm run api
```

This will start the mock API at `http://localhost:3000`.

If you want to serve the Angular app through a proxy to this API (so you can call `/api/...` from the frontend), run:

```bash
ng serve --proxy-config proxy.conf.json
```

### Available npm scripts

- **`npm start`**: Run the Angular development server (`ng serve`).
- **`npm run api`** / **`npm run json-server`**: Start the mock API using `json-server` on port `3000`.
- **`npm run build`**: Build the Angular application for production.
- **`npm run watch`**: Build the app in development mode and watch for file changes.
- **`npm test`**: Run unit tests with Vitest via `ng test`.
- **`npm run serve:ssr:StudyStack_WP`**: Serve the SSR build (after running `npm run build` with SSR output).

### Building for production

Create an optimized production build:

```bash
npm run build
```

The build artifacts will be generated in the `dist/` directory.

### Running unit tests

To execute unit tests with [Vitest](https://vitest.dev/), run:

```bash
npm test
```

### Angular folder structure (high level)

At a glance, the main Angular folders are:

- **`src/`**
  - **`main.ts`**: Bootstraps the Angular application.
  - **`main.server.ts` / `server.ts`**: Entry points for server-side rendering (SSR).
  - **`styles.scss`**: Global styles for the whole app.
  - **`app/`**
    - **`app.ts` / `app.config.ts` / `app.routes.ts`**: Root module/configuration and routing setup.
    - **`layouts/`**: Shared shell layouts for each role (admin, teacher, student), including their dashboards.
    - **`pages/`**: Feature modules/pages such as:
      - `admin-*` pages (e.g., students, teachers, profile, settings)
      - `teacher-*` pages (e.g., attendance, class record, announcements, activities, profile, settings)
      - `student-*` pages (e.g., attendance, grades, activities, announcements, profile, settings)
    - **`auth/`**: Login and authentication-related components.
    - **`services/`**: Angular services (e.g., account, activity, announcement services) for talking to the mock API.

Other relevant files at the root:

- **`db.json`**: Mock database used by `json-server` for the API.
- **`proxy.conf.json`**: Proxy configuration to forward `/api` requests to the mock API.

### Further documentation

For detailed Angular CLI usage and command reference, see the official [Angular CLI documentation](https://angular.dev/tools/cli).
