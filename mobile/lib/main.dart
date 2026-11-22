import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'lesson.dart';

const forest = Color(0xff153f35),
    cream = Color(0xfff6f7f2),
    lime = Color(0xffd9edb6);
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const configured = String.fromEnvironment('API_BASE_URL');
  runApp(
    QarzhyApp(
      api: AcademyApi(
        baseUrl: configured.isNotEmpty
            ? configured
            : kIsWeb
            ? Uri.base.origin
            : kDebugMode
            ? 'http://10.0.2.2:8790'
            : '',
      ),
    ),
  );
}

class QarzhyApp extends StatelessWidget {
  final AcademyApi api;
  const QarzhyApp({super.key, required this.api});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'QARZHЫ Academy',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: forest, primary: forest),
      scaffoldBackgroundColor: cream,
      appBarTheme: const AppBarTheme(
        backgroundColor: cream,
        foregroundColor: forest,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xffe0e6dc)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    ),
    home: AcademyHome(api: api),
  );
}

class AcademyHome extends StatefulWidget {
  final AcademyApi api;
  const AcademyHome({super.key, required this.api});
  @override
  State<AcademyHome> createState() => _HomeState();
}

class _HomeState extends State<AcademyHome> {
  Map<String, dynamic>? data;
  String? error;
  bool busy = true;
  int tab = 0;
  String t(String ru, String kk) => widget.api.language == 'ru' ? ru : kk;
  List<Map<String, dynamic>> get lessons =>
      (data?['lessons'] as List? ?? []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get progress =>
      (data?['progress'] as List? ?? []).cast<Map<String, dynamic>>();
  Map<String, dynamic>? get user => data?['user'];
  String get access => data?['access']?['status'] ?? 'none';
  int get completed => progress.where((p) => p['completed'] == 1).length;
  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    try {
      await widget.api.restore();
      await reload();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          busy = false;
        });
      }
    }
  }

  Future<void> reload() async {
    try {
      final next = await widget.api.request('/api/academy');
      if (mounted) {
        setState(() {
          data = next;
          error = null;
          busy = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          busy = false;
        });
      }
    }
  }

  void message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> auth() async {
    final ok = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AuthScreen(api: widget.api)),
    );
    if (ok == true) await reload();
  }

  Future<void> requestAccess() async {
    if (user == null) {
      await auth();
      return;
    }
    setState(() => busy = true);
    try {
      await widget.api.request('/api/academy/request-access', {});
      await reload();
      message(
        t('Заявка отправлена преподавателю.', 'Өтінім оқытушыға жіберілді.'),
      );
    } catch (e) {
      message(e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String accessText() => switch (access) {
    'active' => t('Доступ открыт', 'Курсқа рұқсат бар'),
    'pending' => t('Заявка на рассмотрении', 'Өтінім қаралуда'),
    'expired' => t('Срок доступа истёк', 'Рұқсат мерзімі аяқталды'),
    'revoked' => t('Доступ закрыт', 'Рұқсат тоқтатылды'),
    _ => t('Открытый первый урок', 'Алғашқы сабақ ашық'),
  };
  Future<void> openLesson(Map<String, dynamic> lesson) async {
    if (lesson['locked'] == true) {
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (context) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.lock_outline, color: forest, size: 32),
                const SizedBox(height: 16),
                Text(
                  t(
                    'Урок откроется после подтверждения доступа',
                    'Сабақ рұқсат берілгеннен кейін ашылады',
                  ),
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  t(
                    'Первый урок открыт для знакомства с курсом. Остальные доступны участникам пилотной группы.',
                    'Бірінші сабақ курспен танысуға ашық. Қалғандары пилоттық топқа қолжетімді.',
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () {
                    Navigator.pop(context);
                    if (access != 'pending') requestAccess();
                  },
                  child: Text(
                    access == 'pending'
                        ? accessText()
                        : t('Подать заявку', 'Өтінім беру'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      return;
    }
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => LessonScreen(
          api: widget.api,
          meta: lesson,
          signedIn: user != null,
          position:
              progress
                  .where((p) => p['lesson'] == lesson['id'])
                  .map((p) => p['position_seconds'] as int? ?? 0)
                  .firstOrNull ??
              0,
        ),
      ),
    );
    await reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'QARZHЫ',
        style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -1),
      ),
      actions: [
        TextButton(
          onPressed: () async {
            widget.api.language = widget.api.language == 'ru' ? 'kk' : 'ru';
            setState(() => busy = true);
            await reload();
          },
          child: Text(widget.api.language == 'ru' ? 'ҚАЗ' : 'РУС'),
        ),
        const SizedBox(width: 10),
      ],
    ),
    body: busy && data == null
        ? const Center(child: CircularProgressIndicator())
        : error != null
        ? ErrorPanel(error: error!, retry: reload)
        : RefreshIndicator(
            onRefresh: reload,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 850),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 28),
                  children: tab == 0
                      ? course()
                      : tab == 1
                      ? results()
                      : profile(),
                ),
              ),
            ),
          ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: tab,
      onDestinationSelected: (v) => setState(() => tab = v),
      backgroundColor: Colors.white,
      indicatorColor: lime,
      destinations: [
        NavigationDestination(
          icon: const Icon(Icons.auto_stories_outlined),
          selectedIcon: const Icon(Icons.auto_stories),
          label: t('Мой курс', 'Курсым'),
        ),
        NavigationDestination(
          icon: const Icon(Icons.insights_outlined),
          label: t('Прогресс', 'Прогресс'),
        ),
        NavigationDestination(
          icon: const Icon(Icons.person_outline),
          label: t('Профиль', 'Профиль'),
        ),
      ],
    ),
  );
  Widget stat(String value, String label) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 5),
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      ),
    ),
  );
  List<Widget> course() => [
    Text(
      user == null
          ? t('Знания для уверенных решений', 'Сенімді шешімге арналған білім')
          : t('С возвращением, ', 'Қайта қош келдіңіз, ') +
                user!['name'].toString().split(' ').first,
      style: const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        height: 1.15,
      ),
    ),
    const SizedBox(height: 18),
    Container(
      padding: const EdgeInsets.all(25),
      decoration: BoxDecoration(
        color: forest,
        borderRadius: BorderRadius.circular(23),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t('ПИЛОТНЫЙ КУРС', 'ПИЛОТТЫҚ КУРС'),
            style: const TextStyle(
              color: lime,
              letterSpacing: 2,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 15),
          Text(
            t('Финансовая\nграмотность', 'Қаржылық\nсауаттылық'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              height: 1.12,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 15),
          Text(
            t(
              '15 уроков · ҚАЗ / РУС\nПрактика и тесты в вашем темпе',
              '15 сабақ · ҚАЗ / РУС\nӨз қарқыныңызбен практика және тест',
            ),
            style: const TextStyle(color: Color(0xffcfddd4), height: 1.7),
          ),
          const SizedBox(height: 22),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: lime,
              foregroundColor: forest,
            ),
            onPressed: busy || access == 'pending'
                ? null
                : access == 'active'
                ? () => openLesson(
                    lessons.firstWhere(
                      (l) => !progress.any(
                        (p) => p['lesson'] == l['id'] && p['completed'] == 1,
                      ),
                      orElse: () => lessons.first,
                    ),
                  )
                : requestAccess,
            child: Text(
              access == 'active'
                  ? t('Продолжить обучение →', 'Оқуды жалғастыру →')
                  : access == 'pending'
                  ? accessText()
                  : t('Подать заявку на доступ →', 'Курсқа өтінім беру →'),
            ),
          ),
        ],
      ),
    ),
    const SizedBox(height: 19),
    Row(
      children: [
        Expanded(child: stat('$completed / 15', t('Завершено', 'Аяқталды'))),
        const SizedBox(width: 12),
        Expanded(
          child: stat(
            '${(completed / 15 * 100).round()}%',
            t('Ваш прогресс', 'Сіздің прогресіңіз'),
          ),
        ),
      ],
    ),
    const SizedBox(height: 13),
    Text(
      t('Программа курса', 'Курс бағдарламасы'),
      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 22),
    ),
    const SizedBox(height: 16),
    for (final lesson in lessons) ...[
      if ([1, 6, 11].contains(lesson['number']))
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 13),
          child: Text(
            'МОДУЛЬ ${lesson['module']}',
            style: const TextStyle(
              color: Colors.grey,
              letterSpacing: 2,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 9,
          ),
          onTap: () => openLesson(lesson),
          leading: CircleAvatar(
            backgroundColor: cream,
            foregroundColor: forest,
            child:
                progress.any(
                  (p) => p['lesson'] == lesson['id'] && p['completed'] == 1,
                )
                ? const Icon(Icons.check)
                : Text(
                    '${lesson['number']}'.padLeft(2, '0'),
                    style: const TextStyle(fontSize: 13),
                  ),
          ),
          title: Text(
            lesson['title'],
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Text(
              lesson['preview'] == true
                  ? t('Открытый урок', 'Ашық сабақ')
                  : t(
                      'Конспект · практика · тест',
                      'Конспект · практика · тест',
                    ),
              style: const TextStyle(fontSize: 11),
            ),
          ),
          trailing: Icon(
            lesson['locked'] == true
                ? Icons.lock_outline
                : Icons.arrow_forward_rounded,
            size: 18,
            color: Colors.grey,
          ),
        ),
      ),
    ],
    Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Text(
        t(
          'Программа апробации. Видео готовятся; оплату пока не принимаем. Учебные материалы требуют утверждения автором.',
          'Апробация бағдарламасы. Бейнелер дайындалуда; төлем әлі қабылданбайды. Оқу материалдарын автор бекітуі тиіс.',
        ),
        style: const TextStyle(fontSize: 12, color: Colors.grey),
      ),
    ),
  ];
  List<Widget> results() => [
    Text(
      t('Ваш прогресс', 'Сіздің прогресіңіз'),
      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 22),
    stat('$completed / 15', t('Уроков завершено', 'Аяқталған сабақ')),
    LinearProgressIndicator(
      value: completed / 15,
      borderRadius: BorderRadius.circular(8),
      minHeight: 8,
    ),
    const SizedBox(height: 24),
    if (user == null) ...[
      Text(
        t(
          'Войдите, чтобы сохранять результаты и продолжать на другом устройстве.',
          'Нәтижелерді сақтау және басқа құрылғыда жалғастыру үшін кіріңіз.',
        ),
      ),
      const SizedBox(height: 15),
      FilledButton(onPressed: auth, child: Text(t('Войти', 'Кіру'))),
    ] else if (progress.isEmpty)
      Text(
        t(
          'Первый шаг — открытый урок. После теста здесь появится результат.',
          'Алғашқы қадам — ашық сабақ. Тесттен кейін нәтиже осында пайда болады.',
        ),
      )
    else
      ...progress.map(
        (p) => Card(
          child: ListTile(
            leading: Icon(
              p['completed'] == 1
                  ? Icons.check_circle_outline
                  : Icons.school_outlined,
              color: forest,
            ),
            title: Text(
              lessons.firstWhere(
                (l) => l['id'] == p['lesson'],
                orElse: () => {'title': p['lesson']},
              )['title'],
              style: const TextStyle(fontSize: 14),
            ),
            subtitle: Text('${p['score']} / ${p['total']}'),
            onTap: () {
              final match = lessons
                  .where((l) => l['id'] == p['lesson'])
                  .firstOrNull;
              if (match != null) openLesson(match);
            },
          ),
        ),
      ),
  ];
  List<Widget> profile() => [
    const SizedBox(height: 10),
    const CircleAvatar(
      radius: 35,
      backgroundColor: lime,
      child: Icon(Icons.person_outline, size: 38, color: forest),
    ),
    const SizedBox(height: 18),
    Text(
      user?['name'] ?? t('Добро пожаловать', 'Қош келдіңіз'),
      textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 27, fontWeight: FontWeight.bold),
    ),
    if (user != null)
      Text(
        user!['email'],
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.grey),
      ),
    const SizedBox(height: 25),
    Card(
      child: ListTile(
        leading: const Icon(Icons.verified_user_outlined),
        title: Text(accessText()),
        subtitle: Text(
          t(
            'Один аккаунт для сайта и приложения',
            'Сайт пен қолданбаға ортақ аккаунт',
          ),
        ),
      ),
    ),
    const SizedBox(height: 12),
    if (user == null)
      FilledButton(
        onPressed: auth,
        child: Text(t('Войти или зарегистрироваться', 'Кіру немесе тіркелу')),
      )
    else ...[
      if (access != 'active' && access != 'pending')
        FilledButton(
          onPressed: busy ? null : requestAccess,
          child: Text(t('Подать заявку на доступ', 'Рұқсатқа өтінім беру')),
        ),
      const SizedBox(height: 10),
      OutlinedButton(
        onPressed: () async {
          try {
            await widget.api.logout();
            await reload();
          } catch (e) {
            message(e.toString());
          }
        },
        child: Text(t('Выйти из аккаунта', 'Аккаунттан шығу')),
      ),
    ],
    const SizedBox(height: 28),
    Text(
      t('О курсе', 'Курс туралы'),
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 10),
    Text(
      t(
        'Курс финансовой грамотности для широкой аудитории. Участие в апробации подтверждает преподаватель. Приложение не выдаёт государственные дипломы или квалификацию.',
        'Кең аудиторияға арналған қаржылық сауаттылық курсы. Апробацияға қатысуды оқытушы растайды. Қолданба мемлекеттік диплом немесе біліктілік бермейді.',
      ),
    ),
  ];
}

class AuthScreen extends StatefulWidget {
  final AcademyApi api;
  const AuthScreen({super.key, required this.api});
  @override
  State<AuthScreen> createState() => _AuthState();
}

class _AuthState extends State<AuthScreen> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController();
  bool register = false, busy = false, obscure = true;
  String? error;
  String t(String ru, String kk) => widget.api.language == 'ru' ? ru : kk;
  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.authenticate(
        email: email.text,
        password: password.text,
        name: register ? name.text : null,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: ListView(
          padding: const EdgeInsets.all(26),
          children: [
            const Icon(Icons.auto_stories_outlined, size: 45, color: forest),
            const SizedBox(height: 25),
            Text(
              register
                  ? t('Начните с одного шага', 'Алғашқы қадамнан бастаңыз')
                  : t('С возвращением', 'Қайта қош келдіңіз'),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(
              t(
                'Общий аккаунт для сайта и приложения QARZHЫ.',
                'QARZHЫ сайты мен қолданбасына ортақ аккаунт.',
              ),
            ),
            const SizedBox(height: 25),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text(t('Вход', 'Кіру'))),
                ButtonSegment(
                  value: true,
                  label: Text(t('Регистрация', 'Тіркелу')),
                ),
              ],
              selected: {register},
              onSelectionChanged: busy
                  ? null
                  : (v) => setState(() {
                      register = v.first;
                      error = null;
                    }),
            ),
            const SizedBox(height: 25),
            Form(
              key: form,
              child: AutofillGroup(
                child: Column(
                  children: [
                    if (register) ...[
                      TextFormField(
                        controller: name,
                        autofillHints: const [AutofillHints.name],
                        decoration: InputDecoration(
                          labelText: t('Имя и фамилия', 'Аты-жөні'),
                        ),
                        validator: (v) =>
                            register && (v?.trim().length ?? 0) < 2
                            ? t('Введите имя', 'Атыңызды енгізіңіз')
                            : null,
                      ),
                      const SizedBox(height: 17),
                    ],
                    TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) =>
                          !RegExp(
                            r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                          ).hasMatch(v?.trim() ?? '')
                          ? t('Проверьте email', 'Email тексеріңіз')
                          : null,
                    ),
                    const SizedBox(height: 17),
                    TextFormField(
                      controller: password,
                      obscureText: obscure,
                      maxLength: 128,
                      autofillHints: [
                        register
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                      decoration: InputDecoration(
                        labelText: t('Пароль', 'Құпиясөз'),
                        helperText: register
                            ? t('Не менее 8 символов', 'Кемінде 8 таңба')
                            : null,
                        suffixIcon: IconButton(
                          tooltip: t(
                            'Показать или скрыть пароль',
                            'Құпиясөзді көрсету',
                          ),
                          onPressed: () => setState(() => obscure = !obscure),
                          icon: Icon(
                            obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (v) => (v?.length ?? 0) < (register ? 8 : 1)
                          ? t(
                              'Проверьте длину пароля',
                              'Құпиясөз ұзындығын тексеріңіз',
                            )
                          : null,
                      onFieldSubmitted: (_) {
                        if (!busy) submit();
                      },
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 15),
                        child: Text(
                          error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: busy ? null : submit,
                        child: Text(
                          busy
                              ? t('Подождите…', 'Күтіңіз…')
                              : register
                              ? t('Создать аккаунт', 'Аккаунт ашу')
                              : t('Войти', 'Кіру'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class ErrorPanel extends StatelessWidget {
  final String error;
  final VoidCallback retry;
  const ErrorPanel({super.key, required this.error, required this.retry});
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 45, color: forest),
          const SizedBox(height: 20),
          Text(error, textAlign: TextAlign.center),
          const SizedBox(height: 22),
          FilledButton(
            onPressed: retry,
            child: const Text('Повторить / Қайталау'),
          ),
        ],
      ),
    ),
  );
}
