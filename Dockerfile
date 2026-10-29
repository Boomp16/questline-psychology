FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.html styles.css character.css rpg-overrides.css final-palette.css visual-fixes.css hard-theme.css navigation-scale.css step-override.css nav-centered.css dashboard.css dashboard-fix.css hero-avatar.css quest-reflection.css nav-row-final.css progress-animation.css nature-check.css crop.css image-size-final.css image-utils.js pet.css assessment.css purple-theme.css assessment-theme.css app.js server.js package.json ./
COPY assets ./assets
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start"]
