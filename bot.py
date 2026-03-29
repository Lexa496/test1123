"""
Telegram-бот с оплатой цифровых товаров через Telegram Stars (XTR).
Деньги идут на баланс бота; вывод/конвертация — по правилам Telegram (см. BotFather / документацию).
"""

import logging
import os
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice, Update, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    PreCheckoutQueryHandler,
    filters,
)

_ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_FILE)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("BOT_TOKEN")
if not BOT_TOKEN:
    raise SystemExit(
        f"Не задан BOT_TOKEN. Создайте файл {_ENV_FILE} "
        "со строкой BOT_TOKEN=... (образец — .env.example)."
    )
PRODUCT_PRICE_STARS = int(os.environ.get("PRODUCT_PRICE_STARS", "10"))
WEB_APP_URL = (os.environ.get("WEB_APP_URL") or "").strip()
API_BASE_URL = (os.environ.get("API_BASE_URL") or "").strip()


def _with_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    q = parse_qs(parsed.query)
    q[key] = [value]
    new_query = urlencode(q, doseq=True)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(
        "Привет! Я принимаю оплату в Telegram Stars.\n\n"
        "Команды:\n"
        "/buy — купить демо-доступ (цифровой товар)\n"
        "/game — демо Mini App (10 тапов по экрану)\n"
        "/terms — условия (заглушка; замените на свои)\n"
        "/support — поддержка\n"
        "/paysupport — вопросы по оплате (требование Telegram для мерчантов)"
    )


async def cmd_game(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    if not WEB_APP_URL:
        await update.message.reply_text(
            "Mini App не настроен: в .env укажите WEB_APP_URL — полный HTTPS-адрес "
            "к файлу index.html из папки webapp/ (через ngrok, хостинг и т.д.)."
        )
        return
    game_url = WEB_APP_URL
    if not game_url.startswith("https://"):
        await update.message.reply_text(
            "WEB_APP_URL должен начинаться с https:// (так требует Telegram для Mini Apps)."
        )
        return

    if API_BASE_URL:
        if not API_BASE_URL.startswith("https://"):
            await update.message.reply_text(
                "API_BASE_URL должен начинаться с https:// (это публичный ngrok/хост для вашего API)."
            )
            return
        game_url = _with_query_param(game_url, "apiBase", API_BASE_URL)

    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Открыть игру", web_app=WebAppInfo(url=game_url))]]
    )
    await update.message.reply_text(
        "Демо: нажми на кнопку и тапни по экрану 10 раз.",
        reply_markup=keyboard,
    )


async def cmd_terms(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(
        "Здесь должны быть ваши условия использования и оферта. "
        "Перед продакшеном замените текст и дайте пользователям явное согласие с условиями."
    )


async def cmd_support(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(
        "Напишите сюда описание, как с вами связаться (email, @username, форма). "
        "Telegram не решает споры по покупкам в вашем боте — отвечаете вы."
    )


async def cmd_paysupport(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(
        "Опишите проблему с оплатой: дата, сумма в Stars, что ожидали получить. "
        "Мы ответим в разумный срок (замените на реальный процесс)."
    )


async def cmd_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    chat_id = update.effective_chat.id
    # Уникальный payload на каждую попытку оплаты (Telegram рекомендует не переиспользовать)
    payload = f"demo_access:{uuid.uuid4().hex}"
    await context.bot.send_invoice(
        chat_id=chat_id,
        title="Демо-доступ",
        description="Разовая покупка цифрового доступа (пример для разработки).",
        payload=payload,
        currency="XTR",
        prices=[LabeledPrice("Доступ", PRODUCT_PRICE_STARS)],
        provider_token="",  # для цифровых товаров в Stars — пустая строка
        # single-chat: пересланный инвойс ведёт в бота, а не оплачивается из любого чата
        start_parameter="demo_access",
    )


async def pre_checkout(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.pre_checkout_query
    if not q:
        return
    # Здесь можно проверить payload, наличие товара на складе, лимиты и т.д.
    if not q.invoice_payload or not q.invoice_payload.startswith("demo_access:"):
        await q.answer(ok=False, error_message="Неизвестный заказ.")
        return
    await q.answer(ok=True)


async def successful_payment(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.successful_payment:
        return
    sp = update.message.successful_payment
    charge_id = sp.telegram_payment_charge_id
    logger.info(
        "Успешная оплата: user=%s payload=%s stars=%s charge_id=%s",
        update.effective_user.id if update.effective_user else None,
        sp.invoice_payload,
        sp.total_amount,
        charge_id,
    )
    # Сохраните charge_id для возможного refundStarPayment
    await update.message.reply_text(
        f"Оплата прошла. Спасибо!\n"
        f"Списано Stars: {sp.total_amount}\n"
        f"ID транзакции (для возврата): {charge_id}"
    )


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("terms", cmd_terms))
    app.add_handler(CommandHandler("support", cmd_support))
    app.add_handler(CommandHandler("paysupport", cmd_paysupport))
    app.add_handler(CommandHandler("buy", cmd_buy))
    app.add_handler(CommandHandler("game", cmd_game))
    app.add_handler(PreCheckoutQueryHandler(pre_checkout))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
