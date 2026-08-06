# Clippy iOS

Expo SDK 57 + **dev client** (pas de simulateur).

## Première fois

1. `npm run login` (ou `npx eas-cli login`)
2. `npx eas-cli init` (récupère le `projectId` → coller dans `app.json` → `extra.eas.projectId`)
3. Apple credentials via EAS (compte Dev déjà prêt)
4. `npm run ios:device` → installe le build sur **iPhone réel**
5. `npm start` → scan QR du metro avec le dev client

## Jamais

- `eas build` avec simulator
- Dépendre d’Expo Go seul pour Live Activities / camera pairing en prod

## API

`extra.apiUrl` pointe vers `https://clippy.runtimelayer.workers.dev`
