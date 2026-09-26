package com.sahabhishek.moneycontrol.data.api

import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Plays the server: each test says what the "server" answers, and sees what was sent. */
class ApiClientTest {
  private val sent = mutableListOf<Request>()
  private val sentBodies = mutableListOf<String>()
  private var signedOutCalls = 0

  private fun client(status: Int = 200, body: String? = null, fail: IOException? = null, token: String? = "tok-123") = ApiClient(
    baseUrl = "https://example.test/api/v1/",
    token = { token },
    onSignedOut = { signedOutCalls++ },
    http = OkHttpClient.Builder().addInterceptor(Interceptor { chain ->
      val req = chain.request()
      sent += req
      sentBodies += req.body?.let { b -> Buffer().also { b.writeTo(it) }.readUtf8() }.orEmpty()
      fail?.let { throw it }
      Response.Builder().request(req).protocol(Protocol.HTTP_1_1).code(status).message("x")
        .body((body ?: "").toResponseBody("application/json".toMediaType())).build()
    }).build(),
  )

  private val meJson = """
    {"ok":true,"data":{"user":{"id":1,"email":"a@example.com","name":"Abhishek Sah","timezone":"Asia/Kolkata","monthlyBudget":null,
    "autoFile":true,"mailSenders":[],"createdAt":"2026-09-25T06:51:04.051Z","somethingNew":1},"connection":"connected","waiting":3,
    "book":{"entries":0,"tracked":0,"since":null},"hasEntries":false,"today":"2026-09-25T15:40:00","bankCount":29}}
  """.trimIndent()

  @Test fun `success unwraps data, ignores unknown fields and sends the bearer token`() = runTest {
    val r = client(body = meJson).get("me", Me.serializer())
    assertTrue(r is ApiResult.Ok)
    val me = (r as ApiResult.Ok).data
    assertEquals(3, me.waiting)
    assertEquals(Connection.Connected, me.connection)
    assertEquals("Abhishek", me.user.firstName)
    assertEquals("Bearer tok-123", sent.single().header("Authorization"))
    assertEquals("https://example.test/api/v1/me", sent.single().url.toString())
  }

  @Test fun `failures carry the server's words and field errors`() = runTest {
    val r = client(422, """{"ok":false,"code":"invalid","error":"Enter an amount like 250","fieldErrors":{"amount":"Enter an amount like 250"}}""")
      .post("entries", body("payee" to "Swiggy", "tagId" to null), Me.serializer())
    r as ApiResult.Failure
    assertEquals(422, r.status)
    assertEquals("invalid", r.code)
    assertEquals(mapOf("amount" to "Enter an amount like 250"), r.fieldErrors)
    assertEquals("""{"payee":"Swiggy"}""", sentBodies.single()) // nulls are left out
    assertEquals(0, signedOutCalls)
  }

  @Test fun `an ended session is reported once so the app can go back to sign-in`() = runTest {
    val r = client(401, """{"ok":false,"code":"signed_out","error":"Your session has ended. Sign in again."}""").get("me", Me.serializer())
    assertEquals("signed_out", (r as ApiResult.Failure).code)
    assertEquals(1, signedOutCalls)
  }

  @Test fun `no network becomes an offline failure, not a crash`() = runTest {
    val r = client(fail = IOException("no route to host")).get("me", Me.serializer()) as ApiResult.Failure
    assertTrue(r.isOffline)
    assertEquals("offline", r.code)
  }

  @Test fun `a proxy's HTML error page is explained, not parsed`() = runTest {
    val r = client(502, "<html>Bad gateway</html>").get("me", Me.serializer()) as ApiResult.Failure
    assertEquals("unreadable", r.code)
    assertEquals("Money Control is having trouble right now. Try again in a moment.", r.error)
  }

  @Test fun `a changed response shape asks for an app update`() = runTest {
    val r = client(body = """{"ok":true,"data":{"waiting":"lots"}}""").get("me", Me.serializer()) as ApiResult.Failure
    assertEquals("unreadable", r.code)
    assertTrue(r.error.contains("Update the app"))
  }

  @Test fun `calls without data report only the message, and no token means no header`() = runTest {
    val r = client(body = """{"ok":true,"message":"Signed out."}""", token = null).post("auth/signout")
    assertEquals("Signed out.", (r as ApiResult.Ok).message)
    assertNull(sent.single().header("Authorization"))
    assertEquals("{}", sentBodies.single()) // POST always carries a JSON object
  }

  @Test fun `query parameters are encoded and nulls dropped`() = runTest {
    client(body = """{"ok":true}""").get("entries", Me.serializer(), mapOf("m" to "2026-09", "q" to "zomato & co", "tag" to null))
    val url = sent.single().url
    assertEquals("2026-09", url.queryParameter("m"))
    assertEquals("zomato & co", url.queryParameter("q"))
    assertFalse(url.queryParameterNames.contains("tag"))
  }

  @Test fun `body builder keeps types`() {
    val b = body("n" to 3, "on" to true, "s" to "x", "list" to listOf("a@b.in"), "skip" to null)
    assertEquals(JsonPrimitive(3), b["n"])
    assertEquals(JsonPrimitive(true), b["on"])
    assertEquals(setOf("n", "on", "s", "list"), b.keys)
  }
}
