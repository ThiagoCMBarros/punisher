<?php
// backend/ArkRconService.php
// Simple RCON client for ARK (TCP socket). No external libs.

class ArkRconService
{
    private $host;
    private $port;
    private $password;
    private $socket;
    private $timeout = 5; // seconds

    public function __construct()
    {
        $this->host = env('ARK_SERVER_IP');
        $this->port = (int) env('ARK_RCON_PORT');
        $this->password = env('ARK_RCON_PASSWORD');
    }

    private function connect()
    {
        $this->socket = @fsockopen($this->host, $this->port, $errno, $errstr, $this->timeout);
        if (!$this->socket) {
            throw new Exception("RCON connection failed: $errstr ($errno)");
        }
        // Authenticate
        $this->sendPacket(3, $this->password); // 3 = SERVERDATA_AUTH (Source RCON spec)
        $response = $this->readPacket();
        if ($response['type'] !== 2) { // 2 = SERVERDATA_AUTH_RESPONSE
            fclose($this->socket);
            throw new Exception('RCON authentication failed');
        }
    }

    private function disconnect()
    {
        if ($this->socket) {
            fclose($this->socket);
            $this->socket = null;
        }
    }

    private function sendPacket($type, $body)
    {
        $requestId = rand(1, 2147483647);
        $payload = pack('V', $requestId) . pack('V', $type) . $body . "\0" . "\0";
        $size = strlen($payload);
        $packet = pack('V', $size) . $payload;
        fwrite($this->socket, $packet);
        return $requestId;
    }

    private function readPacket()
    {
        // First 4 bytes = size
        $sizeData = fread($this->socket, 4);
        if (strlen($sizeData) < 4) {
            throw new Exception('Failed to read RCON packet size');
        }
        $size = unpack('V', $sizeData)[1];
        $data = fread($this->socket, $size);
        if (strlen($data) < $size) {
            throw new Exception('Incomplete RCON packet');
        }
        $parts = unpack('VrequestId/Vtype/a*body', $data);
        // Remove trailing nulls
        $parts['body'] = rtrim($parts['body'], "\0");
        return $parts;
    }

    private function execute($command)
    {
        $this->connect();
        $this->sendPacket(2, $command); // 2 = SERVERDATA_EXECCOMMAND
        $response = $this->readPacket();
        $this->disconnect();
        return $response['body'];
    }

    // Public API -------------------------------------------------
    public function testConnection()
    {
        try {
            $this->connect();
            $this->disconnect();
            return ['ok' => true, 'message' => 'Connection successful'];
        } catch (Exception $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }
    }

    public function listPlayers()
    {
        // ARK command to list players via RCON
        return $this->execute('ListPlayers');
    }

    public function broadcast(string $msg)
    {
        $escaped = addcslashes($msg, "\"");
        return $this->execute("Broadcast {$escaped}");
    }
}
?>
