import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:qarzhy_app/api.dart';
import 'package:qarzhy_app/main.dart';

class GuestApi extends AcademyApi {
  GuestApi() : super(baseUrl: 'https://local.test');
  @override
  Future<void> restore() async {}
  @override
  Future<Map<String, dynamic>> request(
    String path, [
    Map<String, dynamic>? body,
  ]) async => {
    'user': null,
    'access': {'status': 'none'},
    'progress': [],
    'lessons': List.generate(
      15,
      (i) => {
        'id': 'lesson-$i',
        'number': i + 1,
        'title': 'Урок ${i + 1}',
        'module': i ~/ 5 + 1,
        'locked': i > 0,
        'preview': i == 0,
      },
    ),
  };
}

void main() {
  test(
    'native API sends session token and language, and surfaces server rejection',
    () async {
      final api = AcademyApi(
        baseUrl: 'https://local.test',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer session-for-test');
          expect(request.url.queryParameters['lang'], 'ru');
          return http.Response(
            jsonEncode({'error': 'Доступ закрыт'}),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      api.token = 'session-for-test';
      await expectLater(
        api.request('/api/academy/lessons/closed'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)),
      );
    },
  );
  testWidgets('guest can see program, locked access and sign-in screen', (
    tester,
  ) async {
    await tester.pumpWidget(QarzhyApp(api: GuestApi()));
    await tester.pumpAndSettle();
    expect(find.text('Финансовая\nграмотность'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Урок 2'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Урок 2'));
    await tester.pumpAndSettle();
    expect(
      find.text('Урок откроется после подтверждения доступа'),
      findsOneWidget,
    );
    await tester.tap(find.text('Подать заявку'));
    await tester.pumpAndSettle();
    expect(find.text('Регистрация'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
