import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

class AcademyApi {
  final String baseUrl;
  final http.Client client;
  final FlutterSecureStorage storage;
  String language = 'ru';
  String? token;
  AcademyApi({
    required this.baseUrl,
    http.Client? client,
    FlutterSecureStorage? storage,
  }) : client = client ?? http.Client(),
       storage = storage ?? const FlutterSecureStorage();
  Future<void> restore() async {
    if (!kIsWeb) token = await storage.read(key: 'qarzhy_session');
  }

  Future<Map<String, dynamic>> request(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    if (baseUrl.isEmpty) {
      throw ApiException('Сервис пока не подключён к этой сборке.');
    }
    if (kReleaseMode && !kIsWeb && Uri.parse(baseUrl).scheme != 'https') {
      throw ApiException('Для подключения требуется защищённый адрес сервиса.');
    }
    final url = Uri.parse(
      '$baseUrl$path',
    ).replace(queryParameters: {'lang': language});
    final headers = <String, String>{
      'Accept': 'application/json',
      if (!kIsWeb) 'X-QZ-Client': 'mobile',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final http.Response response;
    try {
      response =
          await (body == null
                  ? client.get(url, headers: headers)
                  : client.post(
                      url,
                      headers: {...headers, 'Content-Type': 'application/json'},
                      body: jsonEncode(body),
                    ))
              .timeout(const Duration(seconds: 20));
    } catch (_) {
      throw ApiException(
        language == 'ru'
            ? 'Нет связи с сервером. Проверьте интернет и повторите.'
            : 'Сервермен байланыс жоқ. Интернетті тексеріп, қайталаңыз.',
      );
    }
    Map<String, dynamic> data;
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException(
        language == 'ru'
            ? 'Сервис временно недоступен.'
            : 'Сервис уақытша қолжетімсіз.',
      );
    }
    if (response.statusCode >= 400) {
      if (response.statusCode == 401 && !path.endsWith('/login')) {
        await forget();
      }
      throw ApiException(
        data['error']?.toString() ?? 'Ошибка сервиса',
        response.statusCode,
      );
    }
    return data;
  }

  Future<void> authenticate({
    required String email,
    required String password,
    String? name,
  }) async {
    final data = await request(name == null ? '/api/login' : '/api/register', {
      'email': email.trim(),
      'password': password,
      if (name != null) 'name': name.trim(),
    });
    token = data['token'] as String?;
    if (!kIsWeb && token != null) {
      await storage.write(key: 'qarzhy_session', value: token);
    }
  }

  Future<void> forget() async {
    token = null;
    if (!kIsWeb) await storage.delete(key: 'qarzhy_session');
  }

  Future<void> logout() async {
    await request('/api/logout', {});
    await forget();
  }
}
