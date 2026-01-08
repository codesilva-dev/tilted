## 1. Create Next.js App with TypeScript
- Use `npx create-next-app@latest` with the `--typescript` flag.
- Confirm the project structure uses a `src` directory for code organization.

## 2. Set Up Tailwind CSS
- Install Tailwind and dependencies:
  ```
  npm install -D tailwindcss postcss autoprefixer
  npx tailwindcss init -p
  ```
- Configure `tailwind.config.js`:
  - Set `content` to include all relevant files in `src/`.
- Add Tailwind directives to `src/styles/globals.css`:
  ```
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

## 3. Set Up ESLint and Prettier
- Install ESLint and Prettier:
  ```
  npm install -D eslint prettier eslint-config-prettier eslint-plugin-prettier
  npx eslint --init
  ```
- Configure ESLint for Next.js and TypeScript.
- Add Prettier config (`.prettierrc`) for code formatting consistency.

## 4. Set Up Import Aliases
- Edit `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@components/*": ["src/components/*"],
        "@lib/*": ["src/lib/*"],
        "@styles/*": ["src/styles/*"]
      }
    }
  }
  ```
- Update imports throughout the codebase to use aliases.

## 5. Initialize Git Repository
- Run `git init` if not already initialized.
- Add a `.gitignore` (Next.js template covers most needs).

## 6. (Optional) Set Up Husky and Lint-Staged
- For pre-commit hooks:
  ```
  npx husky-init && npm install
  npm install lint-staged --save-dev
  ```
- Configure `lint-staged` in `package.json` for linting and formatting on commit.

---