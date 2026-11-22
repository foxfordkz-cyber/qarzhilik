import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'api.dart';
import 'main.dart';

class LessonScreen extends StatefulWidget {
  final AcademyApi api;
  final Map<String, dynamic> meta;
  final bool signedIn;
  final int position;
  const LessonScreen({
    super.key,
    required this.api,
    required this.meta,
    required this.signedIn,
    this.position = 0,
  });
  @override
  State<LessonScreen> createState() => _LessonState();
}

class _LessonState extends State<LessonScreen> {
  Map<String, dynamic>? lesson, result;
  String? error, videoError;
  final answers = <int, int>{};
  bool submitting = false;
  VideoPlayerController? video;
  DateTime lastSaved = DateTime.fromMillisecondsSinceEpoch(0);
  String t(String ru, String kk) => widget.api.language == 'ru' ? ru : kk;
  String get path => '/api/academy/lessons/${widget.meta['id']}';
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final response = await widget.api.request(path);
      if (!mounted) return;
      setState(() {
        lesson = response['lesson'];
        error = null;
      });
      final media = await widget.api.request('$path/video');
      if (!mounted || media['available'] != true) return;
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(media['url']),
      );
      video = controller;
      try {
        await controller.initialize();
        if (!mounted) return;
        await controller.seekTo(Duration(seconds: widget.position));
        controller.addListener(savePosition);
        setState(() {});
      } catch (_) {
        if (mounted) {
          setState(
            () => videoError = t(
              'Видео не загрузилось. Попробуйте позже.',
              'Бейне жүктелмеді. Кейінірек көріңіз.',
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  void savePosition() {
    final current = video;
    if (!widget.signedIn ||
        current == null ||
        !current.value.isInitialized ||
        DateTime.now().difference(lastSaved).inSeconds < 15) {
      return;
    }
    lastSaved = DateTime.now();
    widget.api
        .request('$path/position', {
          'seconds': current.value.position.inSeconds,
        })
        .catchError((_) => <String, dynamic>{});
  }

  @override
  void dispose() {
    video?.removeListener(savePosition);
    video?.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final quiz = lesson!['quiz'] as List;
    if (answers.length != quiz.length) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            t('Ответьте на все вопросы', 'Барлық сұраққа жауап беріңіз'),
          ),
        ),
      );
      return;
    }
    setState(() => submitting = true);
    try {
      final r = await widget.api.request('$path/quiz', {
        'answers': List.generate(quiz.length, (i) => answers[i]),
      });
      if (mounted) setState(() => result = r);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  Widget quizQuestion(int i) {
    final q = lesson!['quiz'][i];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${i + 1}. ${q['q']}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            ...List.generate(
              (q['options'] as List).length,
              (j) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Semantics(
                  checked: answers[i] == j,
                  inMutuallyExclusiveGroup: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: submitting
                        ? null
                        : () => setState(() {
                            answers[i] = j;
                            result = null;
                          }),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: answers[i] == j
                            ? const Color(0xffedf3e7)
                            : cream,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            answers[i] == j
                                ? Icons.radio_button_checked
                                : Icons.radio_button_unchecked,
                            size: 20,
                            color: forest,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              q['options'][j],
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        '${t('Урок ', 'Сабақ ')}${widget.meta['number']} / 15',
        style: const TextStyle(fontSize: 15),
      ),
    ),
    body: error != null
        ? ErrorPanel(error: error!, retry: load)
        : lesson == null
        ? const Center(child: CircularProgressIndicator())
        : Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: ListView(
                padding: const EdgeInsets.all(22),
                children: [
                  Text(
                    lesson!['title'],
                    style: const TextStyle(
                      fontSize: 28,
                      height: 1.2,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    lesson!['summary'],
                    style: const TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 22),
                  if (video?.value.isInitialized == true &&
                      videoError == null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(15),
                      child: AspectRatio(
                        aspectRatio: video!.value.aspectRatio,
                        child: VideoPlayer(video!),
                      ),
                    ),
                    ValueListenableBuilder<VideoPlayerValue>(
                      valueListenable: video!,
                      builder: (context, value, _) => Row(
                        children: [
                          IconButton(
                            tooltip: value.isPlaying
                                ? t('Пауза', 'Кідірту')
                                : t('Смотреть', 'Көру'),
                            onPressed: () => value.isPlaying
                                ? video!.pause()
                                : video!.play(),
                            icon: Icon(
                              value.isPlaying ? Icons.pause : Icons.play_arrow,
                            ),
                          ),
                          Expanded(
                            child: VideoProgressIndicator(
                              video!,
                              allowScrubbing: true,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            '${value.position.inMinutes}:${(value.position.inSeconds % 60).toString().padLeft(2, '0')}',
                          ),
                        ],
                      ),
                    ),
                  ] else
                    Container(
                      padding: const EdgeInsets.all(25),
                      decoration: BoxDecoration(
                        color: forest,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.play_circle_outline,
                            color: lime,
                            size: 40,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            videoError ??
                                t('Видео готовится', 'Бейне дайындалуда'),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t(
                              'Конспект, практика и тест доступны ниже.',
                              'Конспект, практика және тест төменде.',
                            ),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xffcfddd4),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 25),
                  Text(
                    t('Что вы узнаете', 'Не үйренесіз'),
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...((lesson!['goals'] as List).map(
                    (g) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text('✓  $g'),
                    ),
                  )),
                  for (final s in lesson!['sections'] as List) ...[
                    const SizedBox(height: 23),
                    Text(
                      s['heading'],
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(s['text'], style: const TextStyle(height: 1.75)),
                    ...((s['points'] as List? ?? []).map(
                      (p) => Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('• $p'),
                      ),
                    )),
                  ],
                  const SizedBox(height: 24),
                  Card(
                    color: const Color(0xffedf3e7),
                    child: Padding(
                      padding: const EdgeInsets.all(22),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            t('На практике', 'Практика'),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 19,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(lesson!['practice']),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    t('Проверьте себя', 'Біліміңізді тексеріңіз'),
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    t(
                      'Для завершения урока нужно 75% правильных ответов.',
                      'Сабақты аяқтау үшін 75% дұрыс жауап қажет.',
                    ),
                  ),
                  const SizedBox(height: 20),
                  ...List.generate(
                    (lesson!['quiz'] as List).length,
                    quizQuestion,
                  ),
                  if (result != null)
                    Card(
                      color: lime,
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${result!['score']} / ${result!['total']} · ${result!['passed'] == true ? t('Урок завершён', 'Сабақ аяқталды') : t('Попробуйте ещё раз', 'Қайта көріңіз')}',
                              style: const TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            ...((result!['feedback'] as List).map(
                              (f) => Padding(
                                padding: const EdgeInsets.only(top: 10),
                                child: Text(
                                  '${f['correct'] == true ? '✓' : '↺'} ${f['explain']}',
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                            )),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: submitting
                        ? null
                        : widget.signedIn
                        ? submit
                        : () async {
                            final ok = await Navigator.push<bool>(
                              context,
                              MaterialPageRoute(
                                builder: (_) => AuthScreen(api: widget.api),
                              ),
                            );
                            if (ok == true && context.mounted) {
                              Navigator.pop(context);
                            }
                          },
                    child: Text(
                      widget.signedIn
                          ? t('Проверить и сохранить', 'Тексеру және сақтау')
                          : t(
                              'Войти для сохранения результата',
                              'Нәтижені сақтау үшін кіру',
                            ),
                    ),
                  ),
                  const SizedBox(height: 25),
                ],
              ),
            ),
          ),
  );
}
