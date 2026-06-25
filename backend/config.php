<?php
// backend/config.php
// Load environment variables from .env (if present) using vlucas/phpdotenv if available.

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
    // Try to load via Dotenv if composer autoload exists.
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload)) {
        require $autoload;
        $dotenv = Dotenv\Dotenv::createImmutable(dirname($envPath));
        $dotenv->load();
    } else {
        // Fallback: parse manually (key=value lines)
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue; // skip comments
            $pair = explode('=', $line, 2);
            if (count($pair) == 2) {
                $key = trim($pair[0]);
                $value = trim($pair[1]);
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
}

// Helper to get env with default.
function env(string $key, $default = null) {
    return $_ENV[$key] ?? $default;
}
?>
