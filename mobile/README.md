# QARZHЫ Academy · Flutter

Мобильный клиент курса: аккаунт, доступ, уроки, результаты тестов и видео. Общий API с сайтом.

Полная инструкция, сценарий демонстрации, настройка сервера и ограничения пилота находятся в [PILOT.md](../PILOT.md).

```powershell
flutter pub get
flutter analyze
flutter test
flutter build web --base-href /app/
flutter build apk --debug
```

Веб-сборка доступна по `/app/` на локальном Node-сервере. Debug Android ожидает сервер компьютера на `http://10.0.2.2:8790` из Android Emulator. Для другого сервера передать `--dart-define=API_BASE_URL=https://ваш-домен`; для release обязателен HTTPS. iOS требует Mac/Xcode и отдельной проверки. Текущая Android debug-сборка не предназначена для магазина.
