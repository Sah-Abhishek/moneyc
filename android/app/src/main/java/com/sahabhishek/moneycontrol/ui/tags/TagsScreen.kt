package com.sahabhishek.moneycontrol.ui.tags

import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.TagGroup
import com.sahabhishek.moneycontrol.data.api.TagUsage
import com.sahabhishek.moneycontrol.ui.ledger.LedgerQuery
import com.sahabhishek.moneycontrol.ui.ledger.dashedBorder
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.ColorPicker
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Hint
import com.sahabhishek.moneycontrol.ui.web.LabeledField
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.PageLede
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.util.rupeesExact
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A tag form as typed (edit or new). */
data class TagForm(val name: String = "", val color: String = "teal", val kind: String = "spend", val budget: String = "")

/** A tag group form as typed (edit or new). */
data class GroupForm(val name: String = "", val tagIds: List<Long> = emptyList())

data class Status(val pending: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap())

data class TagsState(
  val tags: List<Tag> = emptyList(),
  val usage: Map<String, TagUsage> = emptyMap(),
  val loaded: Boolean = false,
  val loadError: String? = null,
  val newTag: TagForm = TagForm(),
  val newStatus: Status = Status(),
  /** per tag id */
  val editStatus: Map<Long, Status> = emptyMap(),
  val mergeStatus: Map<Long, Status> = emptyMap(),
  /** bumps when an edit saves, so its editor closes */
  val saved: Map<Long, Int> = emptyMap(),
  val groups: List<TagGroup> = emptyList(),
  val newGroup: GroupForm = GroupForm(),
  val newGroupStatus: Status = Status(),
  /** per group id */
  val groupStatus: Map<Long, Status> = emptyMap(),
  val groupSaved: Map<Long, Int> = emptyMap(),
  val groupDeleting: Set<Long> = emptySet(),
)

class TagsViewModel(private val book: BookRepository, private val messages: Messenger, changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(TagsState())
  val state: StateFlow<TagsState> = _state.asStateFlow()

  init {
    load()
    viewModelScope.launch { changes.changes.collect { load() } }
  }

  fun load() {
    viewModelScope.launch {
      val tags = async { book.tags() }
      val groups = async { book.tagGroups() }
      val t = tags.await(); val g = groups.await()
      val failure = listOf(t, g).filterIsInstance<ApiResult.Failure>().firstOrNull()
      if (failure != null) {
        _state.update { it.copy(loadError = failure.error) }
        return@launch
      }
      val data = (t as ApiResult.Ok).data
      _state.update { it.copy(tags = data.tags, usage = data.usage, groups = (g as ApiResult.Ok).data.groups, loaded = true, loadError = null) }
    }
  }

  fun editNew(f: (TagForm) -> TagForm) = _state.update { it.copy(newTag = f(it.newTag)) }

  fun add() {
    val f = _state.value.newTag
    if (_state.value.newStatus.pending) return
    _state.update { it.copy(newStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = book.createTag(f.name, f.color, f.kind, f.budget)) {
        is ApiResult.Failure -> _state.update { it.copy(newStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(newStatus = Status(), newTag = TagForm()) }
          messages.say(r.message ?: "Tag added.")
        }
      }
    }
  }

  fun save(id: Long, f: TagForm) {
    _state.update { it.copy(editStatus = it.editStatus + (id to Status(pending = true))) }
    viewModelScope.launch {
      when (val r = book.updateTag(id, f.name, f.color, f.kind, f.budget)) {
        is ApiResult.Failure -> _state.update { it.copy(editStatus = it.editStatus + (id to Status(error = r.error, fieldErrors = r.fieldErrors))) }
        is ApiResult.Ok -> {
          _state.update { it.copy(editStatus = it.editStatus - id, saved = it.saved + (id to (it.saved[id] ?: 0) + 1)) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }

  fun merge(from: Long, into: Long?) {
    if (into == null) {
      _state.update { it.copy(mergeStatus = it.mergeStatus + (from to Status(error = "Choose the tag to merge into"))) }
      return
    }
    _state.update { it.copy(mergeStatus = it.mergeStatus + (from to Status(pending = true))) }
    viewModelScope.launch {
      when (val r = book.mergeTag(from, into)) {
        is ApiResult.Failure -> _state.update { it.copy(mergeStatus = it.mergeStatus + (from to Status(error = r.error))) }
        is ApiResult.Ok -> {
          _state.update { it.copy(mergeStatus = it.mergeStatus - from) }
          messages.say(r.message ?: "Merged.")
        }
      }
    }
  }

  fun delete(id: Long) {
    viewModelScope.launch {
      when (val r = book.deleteTag(id)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Deleted.")
      }
    }
  }

  // ─── tag groups ───────────────────────────────────────────────────────────

  fun editNewGroup(f: (GroupForm) -> GroupForm) = _state.update { it.copy(newGroup = f(it.newGroup)) }

  fun addGroup() {
    val f = _state.value.newGroup
    if (_state.value.newGroupStatus.pending) return
    _state.update { it.copy(newGroupStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = book.createGroup(f.name, f.tagIds)) {
        is ApiResult.Failure -> _state.update { it.copy(newGroupStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(newGroupStatus = Status(), newGroup = GroupForm()) }
          messages.say(r.message ?: "Group added.")
        }
      }
    }
  }

  fun saveGroup(id: Long, f: GroupForm) {
    _state.update { it.copy(groupStatus = it.groupStatus + (id to Status(pending = true))) }
    viewModelScope.launch {
      when (val r = book.updateGroup(id, f.name, f.tagIds)) {
        is ApiResult.Failure -> _state.update { it.copy(groupStatus = it.groupStatus + (id to Status(error = r.error, fieldErrors = r.fieldErrors))) }
        is ApiResult.Ok -> {
          _state.update { it.copy(groupStatus = it.groupStatus - id, groupSaved = it.groupSaved + (id to (it.groupSaved[id] ?: 0) + 1)) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }

  fun deleteGroup(id: Long) {
    _state.update { it.copy(groupDeleting = it.groupDeleting + id) }
    viewModelScope.launch {
      val r = book.deleteGroup(id)
      _state.update { it.copy(groupDeleting = it.groupDeleting - id) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Deleted.")
      }
    }
  }
}

/** app/(book)/tags/page.tsx */
@Composable
fun TagsScreen(shell: ShellState, nav: Nav, vm: TagsViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  Page(shell, Section.Tags, nav::section, nav::readMail, nav::reconnect) {
    when {
      state.loadError != null && !state.loaded -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      !state.loaded -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        SectionHead("Tags", small = "The stamps you put on lines")
        PageLede("Rename a stamp and every line wearing it changes with it. Merging moves one tag's lines and rules onto another. Deleting a tag leaves its lines in the book, untagged.")
        if (state.tags.isEmpty()) EmptyState("No tags yet.", body = "Add the first one below. Tags are how the book knows where the money went.")
        Rule()
        state.tags.forEach { t ->
          TagRow(
            tag = t,
            usage = state.usage[t.id.toString()] ?: TagUsage(),
            others = state.tags.filter { it.id != t.id },
            status = state.editStatus[t.id] ?: Status(),
            mergeStatus = state.mergeStatus[t.id] ?: Status(),
            savedCount = state.saved[t.id] ?: 0,
            onLines = { nav.ledger(LedgerQuery(shell.me?.today?.take(7) ?: "", tag = t)) },
            onSave = { vm.save(t.id, it) },
            onMerge = { into -> vm.merge(t.id, into) },
            onDelete = { vm.delete(t.id) },
          )
        }
        NewTagForm(state.newTag, state.newStatus, vm::editNew, vm::add)

        val spending = state.tags.filter { it.kind == "spend" }
        SectionHead("Groups", Modifier.padding(top = 56.dp), small = "Tags read together")
        PageLede(
          "Put spending tags under one name, like Health for Healthy, Junk and Leisure. Reports then show what the group cost and how it " +
            "splits across its tags, and the ledger can show only its lines. A tag can be in more than one group.",
        )
        if (state.groups.isEmpty()) EmptyState("No groups yet.", body = "Add one below and pick the tags it gathers.")
        else {
          Rule()
          state.groups.forEach { g ->
            GroupRow(
              group = g,
              tags = spending,
              status = state.groupStatus[g.id] ?: Status(),
              savedCount = state.groupSaved[g.id] ?: 0,
              deleting = g.id in state.groupDeleting,
              onReport = { nav.reports(null, "6m", g.id, toGroups = true) },
              onLines = { nav.ledger(LedgerQuery(shell.me?.today?.take(7) ?: "", group = g)) },
              onSave = { vm.saveGroup(g.id, it) },
              onDelete = { vm.deleteGroup(g.id) },
            )
          }
        }
        NewGroupForm(spending, state.newGroup, state.newGroupStatus, vm::editNewGroup, vm::addGroup)
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagRow(
  tag: Tag,
  usage: TagUsage,
  others: List<Tag>,
  status: Status,
  mergeStatus: Status,
  savedCount: Int,
  onLines: () -> Unit,
  onSave: (TagForm) -> Unit,
  onMerge: (Long?) -> Unit,
  onDelete: () -> Unit,
) {
  val c = Ledger.colors
  var open by rememberSaveable(tag.id, savedCount) { mutableStateOf(false) }
  var merging by rememberSaveable(tag.id) { mutableStateOf(false) }
  var form by rememberSaveable(tag.id, tag, savedCount, stateSaver = TagFormSaver) { mutableStateOf(TagForm(tag.name, tag.color, tag.kind, tag.budget?.let(::rupeesExact).orEmpty())) }
  var into by rememberSaveable(tag.id) { mutableStateOf<Long?>(null) }

  Column(Modifier.fillMaxWidth()) {
    FlowRow(
      Modifier.fillMaxWidth().heightIn(min = 58.dp).padding(vertical = 10.dp),
      horizontalArrangement = Arrangement.spacedBy(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
      itemVerticalAlignment = Alignment.CenterVertically,
    ) {
      Stamp(tag.name, if (open) form.color else tag.color)
      Row(Modifier.weight(1f)) {
        Text(
          "${usage.entries} line${if (usage.entries == 1) "" else "s"}",
          Modifier.clickable(role = Role.Button, onClick = onLines),
          style = mono(10.sp, spacing = 0.03).copy(textDecoration = TextDecoration.Underline),
          color = c.inkMuted,
        )
        Text(
          (if (usage.rules > 0) " · ${usage.rules} rule${if (usage.rules == 1) "" else "s"}" else "") +
            (if (tag.kind == "income") " · income" else "") +
            (tag.budget?.let { " · budget ₹${rupeesExact(it)}/month" } ?: ""),
          style = mono(10.sp, spacing = 0.03),
          color = c.inkFaint,
        )
      }
      Btn(if (open) "Close" else "Edit", { open = !open })
    }

    if (open) {
      Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(32.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
          LabeledField("Name") {
            WebInput(form.name, { form = form.copy(name = it) }, maxLength = 40, invalid = status.fieldErrors["name"] != null)
            FieldError(status.fieldErrors["name"])
          }
          LabeledField("Colour") { ColorPicker(form.color) { form = form.copy(color = it) } }
          LabeledField("Counts as") {
            WebSelect(listOf(Option("spend", "Spending"), Option("income", "Income")), form.kind, { form = form.copy(kind = it) })
          }
          LabeledField("Monthly budget") {
            WebInput(form.budget, { form = form.copy(budget = it) }, placeholder = "None", monoFace = true, keyboardType = KeyboardType.Decimal)
            FieldError(status.fieldErrors["budget"])
          }
          FormError(status.error?.takeIf { status.fieldErrors.isEmpty() })
          FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Btn(if (status.pending) "Saving…" else "Save", { onSave(form) }, style = BtnStyle.Ink, enabled = !status.pending)
            if (others.isNotEmpty()) Btn("Merge into…", { merging = !merging })
            ConfirmButton(
              "Delete tag",
              if (usage.entries > 0) "Untag ${usage.entries} line${if (usage.entries == 1) "" else "s"} and delete?" else "Delete this tag?",
              onDelete,
              confirmLabel = "Delete",
            )
          }
        }
        if (merging) {
          Column(Modifier.widthIn(max = 280.dp).border(1.dp, c.inkBase).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            LabeledField("Move ${usage.entries} line${if (usage.entries == 1) "" else "s"} onto") {
              WebSelect(listOf(Option<Long?>(null, "Choose a tag")) + others.map { Option<Long?>(it.id, it.name) }, into, { into = it })
            }
            Hint("“${tag.name}” is removed after the merge. This can't be undone.")
            FormError(mergeStatus.error)
            Btn(if (mergeStatus.pending) "Merging…" else "Merge", { onMerge(into) }, style = BtnStyle.Ink, enabled = !mergeStatus.pending)
          }
        }
      }
    }
    RuleHair()
  }
}

@Composable
private fun NewTagForm(form: TagForm, status: Status, edit: ((TagForm) -> TagForm) -> Unit, onAdd: () -> Unit) {
  Column(
    Modifier.padding(top = 36.dp).fillMaxWidth().widthIn(max = 620.dp).dashedBorder().padding(22.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Eyebrow("A new tag")
    LabeledField("Name") {
      WebInput(form.name, { v -> edit { it.copy(name = v) } }, placeholder = "e.g. Health", maxLength = 40, invalid = status.fieldErrors["name"] != null)
      FieldError(status.fieldErrors["name"])
    }
    LabeledField("Colour") { ColorPicker(form.color) { v -> edit { it.copy(color = v) } } }
    LabeledField("Counts as") {
      WebSelect(listOf(Option("spend", "Spending"), Option("income", "Income")), form.kind, { v -> edit { it.copy(kind = v) } })
    }
    LabeledField("Monthly budget") {
      WebInput(form.budget, { v -> edit { it.copy(budget = v) } }, placeholder = "Optional", monoFace = true, keyboardType = KeyboardType.Decimal)
      FieldError(status.fieldErrors["budget"])
    }
    FormError(status.error?.takeIf { status.fieldErrors.isEmpty() })
    Btn(if (status.pending) "Adding…" else "Add tag", onAdd, Modifier.fillMaxWidth(), style = BtnStyle.Ink, enabled = !status.pending)
  }
}

private val TagFormSaver = androidx.compose.runtime.saveable.Saver<TagForm, List<String>>(
  save = { listOf(it.name, it.color, it.kind, it.budget) },
  restore = { TagForm(it[0], it[1], it[2], it[3]) },
)


// ─── tag groups (TagGroups.tsx) ─────────────────────────────────────────────
// Groups gather spending tags under one name ("Health": Healthy, Junk,
// Leisure) so a month can be read through them on Reports and the Ledger.

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GroupRow(
  group: TagGroup,
  tags: List<Tag>,
  status: Status,
  savedCount: Int,
  deleting: Boolean,
  onReport: () -> Unit,
  onLines: () -> Unit,
  onSave: (GroupForm) -> Unit,
  onDelete: () -> Unit,
) {
  val c = Ledger.colors
  var open by rememberSaveable(group.id, savedCount) { mutableStateOf(false) }
  var form by rememberSaveable(group.id, group, savedCount, stateSaver = GroupFormSaver) { mutableStateOf(GroupForm(group.name, group.tagIds)) }
  val members = group.tagIds.mapNotNull { id -> tags.firstOrNull { it.id == id } }
  val link = mono(10.sp, spacing = 0.03).copy(textDecoration = TextDecoration.Underline)

  Column(Modifier.fillMaxWidth()) {
    FlowRow(
      Modifier.fillMaxWidth().heightIn(min = 58.dp).padding(vertical = 10.dp),
      horizontalArrangement = Arrangement.spacedBy(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
      itemVerticalAlignment = Alignment.CenterVertically,
    ) {
      Text(group.name, Modifier.widthIn(min = 120.dp), style = serif(18.sp), color = c.inkBase)
      FlowRow(Modifier.weight(2f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        members.forEach { Stamp(it.name, it.color) }
      }
      Row(Modifier.weight(1f)) {
        Text("Report", Modifier.clickable(role = Role.Button, onClick = onReport), style = link, color = c.inkMuted)
        Text(" · ", style = mono(10.sp, spacing = 0.03), color = c.inkFaint)
        Text("Lines", Modifier.clickable(role = Role.Button, onClick = onLines), style = link, color = c.inkMuted)
      }
      Btn(if (open) "Close" else "Edit", { open = !open })
    }

    if (open) {
      Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        LabeledField("Name") {
          WebInput(form.name, { form = form.copy(name = it) }, maxLength = 40, invalid = status.fieldErrors["name"] != null)
          FieldError(status.fieldErrors["name"])
        }
        Column {
          TagChecklist(tags, form.tagIds) { form = form.copy(tagIds = it) }
          FieldError(status.fieldErrors["tagIds"])
        }
        FormError(status.error?.takeIf { status.fieldErrors.isEmpty() })
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
          Btn(if (status.pending) "Saving…" else "Save", { onSave(form) }, style = BtnStyle.Ink, enabled = !status.pending)
          ConfirmButton("Delete group", "Delete this group? Its tags and lines stay as they are.", onDelete, confirmLabel = "Delete", pending = deleting)
        }
      }
    }
    RuleHair()
  }
}

@Composable
private fun NewGroupForm(tags: List<Tag>, form: GroupForm, status: Status, edit: ((GroupForm) -> GroupForm) -> Unit, onAdd: () -> Unit) {
  if (tags.isEmpty()) {
    Hint("Add a spending tag first. A group gathers spending tags under one name.")
    return
  }
  Column(
    Modifier.padding(top = 36.dp).fillMaxWidth().widthIn(max = 620.dp).dashedBorder().padding(22.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Eyebrow("A new group")
    LabeledField("Name") {
      WebInput(form.name, { v -> edit { it.copy(name = v) } }, placeholder = "e.g. Health", maxLength = 40, invalid = status.fieldErrors["name"] != null)
      FieldError(status.fieldErrors["name"])
    }
    Column {
      TagChecklist(tags, form.tagIds) { ids -> edit { it.copy(tagIds = ids) } }
      FieldError(status.fieldErrors["tagIds"])
    }
    FormError(status.error?.takeIf { status.fieldErrors.isEmpty() })
    Btn(if (status.pending) "Adding…" else "Add group", onAdd, Modifier.fillMaxWidth(), style = BtnStyle.Ink, enabled = !status.pending)
  }
}

/** "Tags in the group": spending-tag stamps to tick — unticked ones dimmed, ticked ones ringed in ink. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagChecklist(tags: List<Tag>, chosen: List<Long>, onChange: (List<Long>) -> Unit) {
  val c = Ledger.colors
  Column {
    Text("TAGS IN THE GROUP", Modifier.padding(bottom = 8.dp), style = Ledger.type.eyebrow.copy(fontSize = 9.sp), color = c.inkFaint)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      tags.forEach { t ->
        val on = t.id in chosen
        Box(
          Modifier
            .toggleable(on, role = Role.Checkbox) { onChange(if (it) chosen + t.id else chosen - t.id) }
            .drawBehind {
              // box-shadow: 0 0 0 2px paper, 0 0 0 3px ink — a ring outside the stamp
              if (on) {
                val gap = 2.5.dp.toPx()
                drawRect(
                  c.inkBase,
                  topLeft = Offset(-gap, -gap),
                  size = Size(size.width + gap * 2, size.height + gap * 2),
                  style = Stroke(1.dp.toPx()),
                )
              }
            }
            .alpha(if (on) 1f else 0.45f),
        ) {
          Stamp(t.name, t.color)
        }
      }
    }
  }
}

private val GroupFormSaver = androidx.compose.runtime.saveable.Saver<GroupForm, List<String>>(
  save = { listOf(it.name) + it.tagIds.map(Long::toString) },
  restore = { GroupForm(it[0], it.drop(1).map(String::toLong)) },
)
